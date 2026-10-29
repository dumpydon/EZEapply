import { installAIBackground } from './ai/background';
import { installAppBackground } from './app-background';
import { installTrackingBackground } from './tracking-background';
import { PANEL_RESTORE_KEY, STORAGE_KEY, type CustomStore, type FillReport } from './types';
import { emptyStore, getProfileContext, validateProfile } from './storage';
import { adjustTrackingCount } from './tracking-store';

installAIBackground();
installAppBackground();
installTrackingBackground();

// Keep the authoritative answer library in extension-owned IndexedDB and
// restore its chrome.storage cache after an interrupted cache write.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('eze-custom-fields', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readStore(): Promise<CustomStore> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('data').objectStore('data').get('store');
      request.onsuccess = () => resolve(request.result || emptyStore());
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
async function writeStore(store: CustomStore): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('data', 'readwrite');
      tx.objectStore('data').put(store, 'store');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Save interrupted.'));
    });
    await chrome.storage.local.set({ [STORAGE_KEY]: store });
  } finally {
    db.close();
  }
}
let writes = Promise.resolve();
function serial(operation: () => Promise<void>): Promise<void> {
  const task = writes.then(operation);
  writes = task.catch(() => {});
  return task;
}

async function sendToFrame(
  tabId: number,
  frameId: number,
  message: Record<string, unknown>,
): Promise<unknown> {
  try {
    return await chrome.tabs.sendMessage(tabId, message, { frameId });
  } catch {
    // Reconnect a tab opened before installation/reload. The bundle's startup
    // guard prevents duplicate observers if it is already running.
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: ['custom/content.js'],
    });
    return chrome.tabs.sendMessage(tabId, message, { frameId });
  }
}

async function dispatch(action: string): Promise<FillReport> {
  if (!['scan', 'fill', 'undo', 'attach-resume'].includes(action))
    throw new Error('Unknown action.');
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || '')) {
    throw new Error(
      'Open a regular application webpage first. Chrome settings and the Web Store cannot be filled.',
    );
  }
  // Enumerating actual frames also works after Chrome suspends the worker. A
  // broadcast message alone returns only one frame's response and can miss forms.
  const pageFrames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
  const targets = (pageFrames || [{ frameId: 0, url: tab.url!, documentId: undefined }]).filter(
    (frame) => /^(https?:|about:|blob:|data:)/.test(frame.url),
  );
  const results = await Promise.allSettled(
    targets.map(async ({ frameId, documentId }) => {
      const report = (await sendToFrame(tab.id!, frameId, {
        type: `eze-custom:${action}`,
      })) as FillReport;
      if (!report || !Array.isArray(report.questions)) throw new Error('Invalid form response.');
      return {
        ...report,
        questions: report.questions.map((q: { id: string }) => ({
          ...q,
          id: `${frameId}:${q.id}`,
          ...(documentId ? { documentId } : {}),
        })),
      } as FillReport;
    }),
  );
  const reports = results
    .filter((r): r is PromiseFulfilledResult<FillReport> => r.status === 'fulfilled')
    .map((r) => r.value);
  if (!reports.length)
    throw new Error(
      'Reload this application page once so the custom-fields extension can connect.',
    );
  const errors = reports.map((r) => r.error).filter((value): value is string => !!value);
  if (reports.length < targets.length)
    errors.push(
      'Some embedded frames could not be inspected. Reload the page if the application is inside an iframe.',
    );
  const warnings = [...new Set([...reports.flatMap((report) => report.warnings || []), ...errors])];
  return {
    tabId: tab.id,
    filled: reports.reduce((n, r) => n + r.filled, 0),
    skipped: reports.reduce((n, r) => n + r.skipped, 0),
    questions: reports.flatMap((r) => r.questions),
    ...(warnings.length ? { warnings } : {}),
  };
}

async function openAIDraft(message: Record<string, unknown>): Promise<{ ok: true }> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || tab.id !== message.tabId || !/^https?:/.test(tab.url || ''))
    throw new Error(
      'The application tab changed. Find questions again in the tab you want to answer.',
    );
  const parts =
    typeof message.questionId === 'string' ? /^(\d+):(.{1,100})$/.exec(message.questionId) : null;
  if (
    !parts ||
    typeof message.questionLabel !== 'string' ||
    !message.questionLabel.trim() ||
    message.questionLabel.length > 500
  )
    throw new Error('Find questions again before opening an AI draft.');
  const frameId = Number(parts[1]);
  if (!Number.isSafeInteger(frameId)) throw new Error('Invalid application frame.');
  const currentFrames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
  const current = currentFrames?.find((frame) => frame.frameId === frameId);
  if (!current || (message.documentId && current.documentId !== message.documentId))
    throw new Error('This form navigated to another step. Find questions again before drafting.');
  const result = (await chrome.tabs.sendMessage(
    tab.id,
    { type: 'eze-custom:open-ai', questionId: parts[2], questionLabel: message.questionLabel },
    { frameId, ...(current.documentId ? { documentId: current.documentId } : {}) },
  )) as { ok?: boolean; error?: string } | undefined;
  if (!result?.ok)
    throw new Error(
      result?.error || 'Could not open the AI draft. Refresh the application page and try again.',
    );
  return { ok: true };
}

const PANEL_STATE = 'eze.hiddenPanelWindows';
let panelWrites = Promise.resolve();
async function setPanelHidden(windowId: number, hidden: boolean): Promise<void> {
  const write = panelWrites.then(async () => {
    const data = await chrome.storage.session.get(PANEL_STATE);
    const windows = new Set<number>(
      Array.isArray(data[PANEL_STATE]) ? (data[PANEL_STATE] as number[]) : [],
    );
    if (hidden) windows.add(windowId);
    else windows.delete(windowId);
    await chrome.storage.session.set({ [PANEL_STATE]: [...windows] });
    const tabs = await chrome.tabs.query({ windowId });
    await Promise.allSettled(
      tabs
        .filter((tab) => tab.id)
        .map((tab) =>
          chrome.tabs.sendMessage(
            tab.id!,
            { type: 'eze-custom:panel-hidden', hidden },
            { frameId: 0 },
          ),
        ),
    );
  });
  panelWrites = write.catch(() => {});
  await write;
}

// Reopening through Chrome's toolbar must clear the webpage restore affordance
// too, not only reopening through the webpage button.
const panelEvents = chrome.sidePanel as typeof chrome.sidePanel & {
  onOpened?: { addListener(listener: (info: { windowId: number }) => void): void };
};
panelEvents.onOpened?.addListener((info) => {
  void setPanelHidden(info.windowId, false).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || typeof message.type !== 'string' || !message.type.startsWith('eze-custom:'))
    return;
  if (message.type === 'eze-custom:show-panel' && sender.tab?.windowId !== undefined) {
    // Call immediately while Chrome still associates the message with the
    // user's restore-button gesture; awaiting storage first loses that gesture.
    const windowId = sender.tab.windowId;
    chrome.sidePanel.open({ windowId }).then(
      async () => {
        await setPanelHidden(windowId, false);
        respond({ ok: true });
      },
      (error) => respond({ error: String(error) }),
    );
    return true;
  }
  if (message.type === 'eze-custom:panel-state' && sender.tab?.windowId !== undefined) {
    const windowId = sender.tab.windowId;
    chrome.storage.session.get(PANEL_STATE).then(
      (data) =>
        respond({
          hidden:
            Array.isArray(data[PANEL_STATE]) && (data[PANEL_STATE] as number[]).includes(windowId),
        }),
      () => respond({ hidden: false }),
    );
    return true;
  }
  if (
    message.type === 'eze-custom:ready' &&
    sender.tab?.id !== undefined &&
    sender.frameId !== undefined
  ) {
    // Readiness is an acknowledgement only. Dispatch enumerates current frames
    // from webNavigation rather than keeping an unused, stale worker cache.
    respond({ ok: true });
    return;
  }
  if (message.type === 'eze-custom:report' && sender.tab?.id !== undefined) {
    respond({ ok: true });
    return;
  }
  // Storage changes and page-wide actions only come from our own extension UI.
  if (sender.tab && !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  const work = async () => {
    if (message.type === 'eze-custom:adjust-count') {
      return adjustTrackingCount(message.delta, message.day);
    }
    if (message.type === 'eze-custom:auto-fill') {
      if (
        typeof message.profileId !== 'string' ||
        !message.profileId ||
        message.profileId.length > 200 ||
        ['__proto__', 'constructor', 'prototype'].includes(message.profileId)
      )
        throw new Error('Invalid profile.');
      if (typeof message.enabled !== 'boolean')
        throw new Error('Choose whether to enable automatic filling.');
      await serial(async () => {
        if ((await getProfileContext()).id !== message.profileId)
          throw new Error('Your profile changed. Try the toggle again for the current profile.');
        const store = await readStore();
        const profile = store.profiles[message.profileId]
          ? validateProfile(store.profiles[message.profileId])
          : { fields: [], autoFill: true };
        store.profiles[message.profileId] = { ...profile, autoFill: message.enabled };
        await writeStore(store);
      });
      return { ok: true };
    }
    if (message.type === 'eze-custom:save') {
      if (
        typeof message.profileId !== 'string' ||
        !message.profileId ||
        message.profileId.length > 200 ||
        ['__proto__', 'constructor', 'prototype'].includes(message.profileId)
      )
        throw new Error('Invalid profile.');
      const profile = validateProfile(message.profile);
      await serial(async () => {
        const store = await readStore();
        store.profiles[message.profileId] = profile;
        await writeStore(store);
      });
      return { ok: true };
    }
    if (message.type === 'eze-custom:dispatch') return dispatch(message.action);
    if (message.type === 'eze-custom:open-ai') return openAIDraft(message);
    if (message.type === 'eze-custom:hide-panel') {
      if (!chrome.sidePanel.close)
        throw new Error(
          'This Chrome version needs its built-in side-panel close button. Reopen EZEapply from the toolbar.',
        );
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id || tab.windowId === undefined)
        throw new Error('No active Chrome window was found. Use Chrome’s side-panel close button.');
      const preference = await chrome.storage.local.get(PANEL_RESTORE_KEY);
      const showRestore = preference[PANEL_RESTORE_KEY] === true && /^https?:/.test(tab.url || '');
      if (showRestore)
        await sendToFrame(tab.id, 0, { type: 'eze-custom:panel-hidden', hidden: true });
      try {
        await chrome.sidePanel.close({ windowId: tab.windowId });
      } catch (error) {
        if (showRestore)
          await chrome.tabs
            .sendMessage(tab.id, { type: 'eze-custom:panel-hidden', hidden: false }, { frameId: 0 })
            .catch(() => {});
        throw error;
      }
      await setPanelHidden(tab.windowId, true);
      return { ok: true };
    }
    return undefined;
  };
  void work().then(respond, (error) =>
    respond({ error: error instanceof Error ? error.message : 'Something went wrong.' }),
  );
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY] && !changes[STORAGE_KEY].newValue) {
    void serial(async () => {
      await chrome.storage.local.set({ [STORAGE_KEY]: await readStore() });
    });
  }
});
void serial(async () => {
  await chrome.storage.local.set({ [STORAGE_KEY]: await readStore() });
});
