import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { APPLICATION_COUNTS_KEY, PANEL_RESTORE_KEY, STORAGE_KEY } from '../src/types';
import { localDay } from '../src/application-count';

type Listener = (...args: any[]) => any;
let messages: Listener[];
let storageListeners: Listener[];
let data: Record<string, unknown>;
const profile = {
  autoFill: true,
  fields: [
    {
      id: 'notice',
      label: 'Notice period',
      value: '30 days',
      aliases: [],
      exclude: [],
      category: 'Personal questions',
      enabled: true,
      matchMode: 'phrase',
      scope: '',
    },
  ],
};

async function send(
  message: unknown,
  sender: unknown = { url: 'chrome-extension://test/sidepanel.html' },
) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No response')), 2000);
    messages.forEach((listener) =>
      listener(message, sender, (value: unknown) => {
        clearTimeout(timer);
        resolve(value);
      }),
    );
  });
}

beforeEach(async () => {
  vi.resetModules();
  messages = [];
  storageListeners = [];
  data = {};
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: (p: string) => `chrome-extension://test/${p}`,
      onMessage: { addListener: (fn: Listener) => messages.push(fn) },
    },
    storage: {
      local: {
        get: async () => data,
        set: async (values: Record<string, unknown>) => {
          Object.assign(data, values);
        },
      },
      session: {
        get: async () => data,
        set: async (values: Record<string, unknown>) => Object.assign(data, values),
      },
      onChanged: { addListener: (fn: Listener) => storageListeners.push(fn) },
    },
    tabs: {
      onRemoved: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
      query: vi.fn(async () => [{ id: 3, windowId: 7, url: 'https://example.test/apply' }]),
      sendMessage: vi.fn(async (_tab: number, _message: unknown, target: { frameId: number }) => ({
        filled: 1,
        skipped: 0,
        questions: [{ id: 'q', label: `Frame ${target.frameId}`, kind: 'input', filled: true }],
      })),
    },
    webNavigation: {
      getAllFrames: vi.fn(async () => [
        { frameId: 0, url: 'https://example.test/apply' },
        { frameId: 2, url: 'https://ats.test/apply' },
      ]),
    },
    scripting: {
      insertCSS: vi.fn().mockResolvedValue(undefined),
      executeScript: vi.fn().mockResolvedValue([]),
    },
    sidePanel: {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    },
  });
  await import('../src/background');
});
afterEach(() => vi.unstubAllGlobals());

describe('background persistence and frame dispatch', () => {
  it('accepts profile changes only from extension views and keeps answer libraries intact', async () => {
    data[STORAGE_KEY] = { version: 1, profiles: { local: profile } };
    const request = {
      type: 'eze-app:save-profile',
      profile: {
        nameData: { firstName: 'Alex' },
        jobData: [{ company: 'Example', startDate: { month: 2, year: 2024 } }],
      },
    };
    expect(
      await send(request, { url: 'https://employer.test/apply', tab: { id: 3 } }),
    ).toHaveProperty('error');
    expect(data.profile).toBeUndefined();
    expect(await send(request)).toEqual({ ok: true });
    expect((data.profile as Record<string, unknown>).jobData).toEqual(request.profile.jobData);
    expect(data[STORAGE_KEY]).toEqual({ version: 1, profiles: { local: profile } });
  });
  it('serializes simultaneous journal stage edits and rejects unsupported stages', async () => {
    await Promise.all([
      send({ type: 'eze-app:stage', id: 'record-a', stage: 'Interview' }),
      send({ type: 'eze-app:stage', id: 'record-b', stage: 'Offer' }),
    ]);
    expect(data['eze.applicationStages.v1']).toEqual({
      'record-a': 'Interview',
      'record-b': 'Offer',
    });
    expect(await send({ type: 'eze-app:stage', id: 'record-a', stage: 'Invented' })).toHaveProperty(
      'error',
    );
    expect(data['eze.applicationStages.v1']).toEqual({
      'record-a': 'Interview',
      'record-b': 'Offer',
    });
  });
  it('validates the master autofill preference independently of saved answer preferences', async () => {
    expect(await send({ type: 'eze-app:autofill', enabled: 'yes' })).toHaveProperty('error');
    expect(data.autofillEnabled).toBeUndefined();
    expect(await send({ type: 'eze-app:autofill', enabled: false })).toEqual({ ok: true });
    expect(data.autofillEnabled).toBe(false);
  });
  it('serializes manual daily-count corrections without adding application records', async () => {
    const today = localDay();
    data.appliedList = [{ jobTitle: 'Example', date: new Date().toString() }];
    await Promise.all([
      send({ type: 'eze-custom:adjust-count', delta: 1, day: today }),
      send({ type: 'eze-custom:adjust-count', delta: 1, day: today }),
    ]);
    expect((data[APPLICATION_COUNTS_KEY] as Record<string, number>)[today]).toBe(2);
    expect(data.appliedList).toHaveLength(1);
    expect(await send({ type: 'eze-custom:adjust-count', delta: -1, day: today })).toEqual({
      ok: true,
      count: 2,
    });
  });
  it('does not decrease the application count below zero or apply yesterday’s correction today', async () => {
    const today = localDay();
    expect(await send({ type: 'eze-custom:adjust-count', delta: -1, day: today })).toEqual({
      ok: true,
      count: 0,
    });
    expect((data[APPLICATION_COUNTS_KEY] as Record<string, number>)[today]).toBe(0);
    expect(
      (await send({ type: 'eze-custom:adjust-count', delta: 20, day: today })).error,
    ).toContain('one at a time');
    expect(
      (await send({ type: 'eze-custom:adjust-count', delta: 1, day: '2000-01-01' })).error,
    ).toContain('day changed');
  });
  it('persists to IndexedDB and restores the cache after native sign-out clears storage', async () => {
    expect(await send({ type: 'eze-custom:save', profileId: 'local', profile })).toEqual({
      ok: true,
    });
    const original = data[STORAGE_KEY];
    delete data[STORAGE_KEY];
    storageListeners.forEach((fn) => fn({ [STORAGE_KEY]: { oldValue: original } }, 'local'));
    await vi.waitFor(() => expect(data[STORAGE_KEY]).toEqual(original));
  });
  it('serializes writes so saving two profiles does not lose either one', async () => {
    await Promise.all([
      send({ type: 'eze-custom:save', profileId: 'a', profile }),
      send({ type: 'eze-custom:save', profileId: 'b', profile }),
    ]);
    expect(Object.keys((data[STORAGE_KEY] as any).profiles)).toEqual(['a', 'b']);
  });
  it('changes automatic filling atomically without replacing fields or layout preferences', async () => {
    const saved = {
      ...profile,
      hiddenBuiltIns: ['builtin:middle'],
      fieldOrder: ['notice', 'builtin:first'],
      profileOverrides: [
        { ...profile.fields[0], id: 'builtin:first', label: 'First name', value: 'Alexander' },
      ],
    };
    await send({ type: 'eze-custom:save', profileId: 'local', profile: saved });
    const updated = { ...saved, fields: [{ ...profile.fields[0], value: '7' }] };
    await Promise.all([
      send({ type: 'eze-custom:save', profileId: 'local', profile: updated }),
      send({ type: 'eze-custom:auto-fill', profileId: 'local', enabled: false }),
    ]);
    expect((data[STORAGE_KEY] as any).profiles.local).toEqual({ ...updated, autoFill: false });
    const original = data[STORAGE_KEY];
    delete data[STORAGE_KEY];
    storageListeners.forEach((fn) => fn({ [STORAGE_KEY]: { oldValue: original } }, 'local'));
    await vi.waitFor(() => expect(data[STORAGE_KEY]).toEqual(original));
  });
  it('can save the toggle before any custom fields exist', async () => {
    expect(
      await send({ type: 'eze-custom:auto-fill', profileId: 'local', enabled: false }),
    ).toEqual({ ok: true });
    expect((data[STORAGE_KEY] as any).profiles.local).toEqual({ fields: [], autoFill: false });
    expect(await send({ type: 'eze-custom:auto-fill', profileId: 'local', enabled: true })).toEqual(
      { ok: true },
    );
    expect((data[STORAGE_KEY] as any).profiles.local.autoFill).toBe(true);
  });
  it('rejects stale-profile or malformed auto-fill writes', async () => {
    await send({ type: 'eze-custom:save', profileId: 'local', profile });
    data.lastSyncProfile = { id: 'other' };
    expect(
      (await send({ type: 'eze-custom:auto-fill', profileId: 'local', enabled: false })).error,
    ).toContain('profile changed');
    expect((data[STORAGE_KEY] as any).profiles.local.autoFill).toBe(true);
    expect(
      (await send({ type: 'eze-custom:auto-fill', profileId: 'other', enabled: 'true' })).error,
    ).toContain('whether');
    expect(
      (await send({ type: 'eze-custom:auto-fill', profileId: '__proto__', enabled: true })).error,
    ).toBe('Invalid profile.');
  });
  it('retains removed-profile-shortcut preferences across cache restoration', async () => {
    const preference = {
      ...profile,
      hiddenBuiltIns: ['builtin:middle'],
      fieldOrder: ['builtin:first', 'builtin:last', 'builtin:middle'],
    };
    await send({ type: 'eze-custom:save', profileId: 'local', profile: preference });
    const original = data[STORAGE_KEY];
    delete data[STORAGE_KEY];
    storageListeners.forEach((fn) => fn({ [STORAGE_KEY]: { oldValue: original } }, 'local'));
    await vi.waitFor(() =>
      expect((data[STORAGE_KEY] as any)?.profiles.local.hiddenBuiltIns).toEqual(['builtin:middle']),
    );
    expect((data[STORAGE_KEY] as any).profiles.local.fieldOrder).toEqual(preference.fieldOrder);
  });
  it('dispatches to every frame and labels frame-specific question IDs', async () => {
    const report = await send({ type: 'eze-custom:dispatch', action: 'fill' });
    expect(report.filled).toBe(2);
    expect(report.questions.map((q: any) => q.id)).toEqual(['0:q', '2:q']);
    expect(report.tabId).toBe(3);
  });
  it('opens an AI draft in exactly the reported frame/document without a provider call', async () => {
    vi.mocked(chrome.webNavigation.getAllFrames).mockImplementation(async () => [
      {
        frameId: 2,
        documentId: 'document-a',
        url: 'https://ats.test/apply',
      } as chrome.webNavigation.GetAllFrameResultDetails,
    ]);
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(async () => ({ ok: true }));
    expect(
      await send({
        type: 'eze-custom:open-ai',
        tabId: 3,
        questionId: '2:question-4',
        questionLabel: 'Describe your best project',
        documentId: 'document-a',
      }),
    ).toEqual({ ok: true });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      3,
      {
        type: 'eze-custom:open-ai',
        questionId: 'question-4',
        questionLabel: 'Describe your best project',
      },
      { frameId: 2, documentId: 'document-a' },
    );
  });
  it('rejects stale-tab, stale-document and invalid AI question references', async () => {
    vi.mocked(chrome.webNavigation.getAllFrames).mockImplementation(async () => [
      {
        frameId: 2,
        documentId: 'new-document',
        url: 'https://ats.test/apply',
      } as chrome.webNavigation.GetAllFrameResultDetails,
    ]);
    const request = {
      type: 'eze-custom:open-ai',
      tabId: 3,
      questionId: '2:question-4',
      questionLabel: 'Describe your best project',
      documentId: 'old-document',
    };
    expect((await send(request)).error).toContain('navigated');
    expect((await send({ ...request, tabId: 9 })).error).toContain('tab changed');
    expect((await send({ ...request, questionId: 'bad' })).error).toContain('Find questions');
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
  it('reports partial embedded-frame coverage', async () => {
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(
      async (_tab: any, _message: any, target: any) => {
        if (target.frameId === 2) throw new Error('frame inaccessible');
        return { filled: 1, skipped: 0, questions: [] };
      },
    );
    const report = await send({ type: 'eze-custom:dispatch', action: 'fill' });
    expect(report.filled).toBe(1);
    expect(report.warnings.join(' ')).toContain('embedded frames');
  });
  it('reconnects a pre-existing frame by injecting the guarded content bundle', async () => {
    vi.mocked(chrome.tabs.sendMessage).mockRejectedValueOnce(new Error('No receiver'));
    const report = await send({ type: 'eze-custom:dispatch', action: 'scan' });
    expect(report.questions).toHaveLength(2);
    expect(chrome.scripting.insertCSS).not.toHaveBeenCalled();
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 3, frameIds: [0] },
      files: ['custom/content.js'],
    });
  });
  it('hides the real panel and exposes a restore button on the webpage', async () => {
    data[PANEL_RESTORE_KEY] = true;
    expect(await send({ type: 'eze-custom:hide-panel' })).toEqual({ ok: true });
    expect(chrome.sidePanel.close).toHaveBeenCalledWith({ windowId: 7 });
    expect(data['eze.hiddenPanelWindows']).toEqual([7]);
    expect(await send({ type: 'eze-custom:panel-state' }, { tab: { id: 3, windowId: 7 } })).toEqual(
      { hidden: true },
    );
  });
  it('can hide the panel on a restricted page without a floating restore button', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(async () => [
      { id: 3, windowId: 7, url: 'chrome://newtab/' } as chrome.tabs.Tab,
    ]);
    expect(await send({ type: 'eze-custom:hide-panel' })).toEqual({ ok: true });
    expect(chrome.sidePanel.close).toHaveBeenCalledWith({ windowId: 7 });
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });
  it('opens the panel directly from the user gesture before reading session state', async () => {
    const result = await send({ type: 'eze-custom:show-panel' }, { tab: { id: 3, windowId: 7 } });
    expect(result).toEqual({ ok: true });
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
    expect(data['eze.hiddenPanelWindows']).toEqual([]);
  });
  it('acknowledges content reports even when the native worker keeps unknown channels open', async () => {
    expect(
      await send(
        { type: 'eze-custom:report', report: { filled: 1 } },
        { tab: { id: 3 }, frameId: 2, url: 'https://example.test/apply' },
      ),
    ).toEqual({ ok: true });
  });
  it('rejects malformed data and prototype-key profile IDs', async () => {
    expect((await send({ type: 'eze-custom:save', profileId: '__proto__', profile })).error).toBe(
      'Invalid profile.',
    );
    expect(
      (await send({ type: 'eze-custom:save', profileId: 'local', profile: {} })).error,
    ).toContain('fields list');
  });
});
