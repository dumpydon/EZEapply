// Synthetic browser verification only. Never packaged into EZEapply.
import { installTrackingBackground } from '../src/tracking-background';
import { adjustTrackingCount, trackingSnapshot, updateTracking } from '../src/tracking-store';
import { localDayKey } from '../src/tracking-model';
import { APPLICATION_COUNTS_KEY } from '../src/types';
import { TRACKING_CACHE_KEY, TRACKING_DAILY_TOTALS_KEY } from '../src/tracking-types';
type EventListener = (...args: any[]) => void;
type Bridge = {
  get(): Record<string, any>;
  set(values: Record<string, unknown>): Promise<void>;
  listeners: Set<EventListener>;
  send(message: any, sender?: any): Promise<any>;
  ready: Promise<void>;
};
declare global {
  interface Window {
    EZE_TRACKING_BRIDGE?: Bridge;
  }
}
const base = window.chrome;
const key = 'eze-tracking-preview-v1';
const trackKeys = new Set([
  'appliedList',
  'dailyGoal',
  APPLICATION_COUNTS_KEY,
  TRACKING_CACHE_KEY,
  TRACKING_DAILY_TOTALS_KEY,
]);
let bridge: Bridge | undefined;
try {
  if (window.parent !== window) bridge = window.parent.EZE_TRACKING_BRIDGE;
} catch {}
const originalRuntime = base?.runtime;
if (!bridge) {
  const listeners = new Set<EventListener>(),
    messages = new Set<EventListener>();
  const read = () => JSON.parse(localStorage.getItem(key) || '{"appliedList":[],"dailyGoal":10}');
  const write = async (values: Record<string, unknown>) => {
    const before = read(),
      after = { ...before, ...values };
    localStorage.setItem(key, JSON.stringify(after));
    const diff = Object.fromEntries(
      Object.keys(values).map((name) => [name, { oldValue: before[name], newValue: after[name] }]),
    );
    listeners.forEach((fn) => fn(diff, 'local'));
  };
  bridge = {
    get: read,
    set: write,
    listeners,
    ready: Promise.resolve(),
    send: async (message, sender) => {
      if (message.type === 'eze-custom:adjust-count')
        return adjustTrackingCount(message.delta, message.day);
      return new Promise((resolve) => {
        messages.forEach((fn) =>
          fn(message, sender || { url: 'chrome-extension://fixture/analytics.html' }, resolve),
        );
      });
    },
  };
  window.EZE_TRACKING_BRIDGE = bridge;
  const storageGet = (keys: any, callback?: any) => {
    const all = read();
    const values =
      keys == null
        ? all
        : Object.fromEntries(
            (typeof keys === 'string'
              ? [keys]
              : Array.isArray(keys)
                ? keys
                : Object.keys(keys)
            ).map((name: string) => [name, all[name]]),
          );
    callback?.(values);
    return Promise.resolve(values);
  };
  window.chrome = {
    ...(base || {}),
    runtime: {
      ...(originalRuntime || {}),
      id: 'fixture',
      getURL: (path: string) => '/' + path.replace(/^\//, ''),
      onMessage: { addListener: (fn: EventListener) => messages.add(fn) },
    },
    storage: {
      local: { get: storageGet, set: write },
      session: {
        get: async () => JSON.parse(sessionStorage.getItem(key) || '{}'),
        set: async (values: Record<string, unknown>) => {
          sessionStorage.setItem(
            key,
            JSON.stringify({ ...JSON.parse(sessionStorage.getItem(key) || '{}'), ...values }),
          );
        },
      },
      onChanged: {
        addListener: (fn: EventListener) => listeners.add(fn),
        removeListener: (fn: EventListener) => listeners.delete(fn),
      },
    },
    tabs: { onRemoved: { addListener() {} }, create: async ({ url }: any) => window.open(url) },
  } as any;
  // The fixture uses the real worker handlers and IndexedDB ledger. Only the
  // extension transport and applicant data are synthetic.
  const runtimeGetURL = window.chrome.runtime.getURL;
  window.chrome.runtime.getURL = (path: string) =>
    path === '' ? 'chrome-extension://fixture/' : runtimeGetURL(path);
  installTrackingBackground();
  window.chrome.runtime.getURL = runtimeGetURL;
  // Worker authorization uses the same synthetic extension origin in this page.
  window.chrome.runtime.getURL = (path: string) =>
    path === '' ? 'chrome-extension://fixture/' : runtimeGetURL(path);
  const seeded = new URL(location.href).searchParams.has('sample');
  bridge.ready = (async () => {
    if (seeded && !(await trackingSnapshot()).records.length) {
      await updateTracking((state) => {
        for (let day = 0; day < 60; day++)
          for (let n = 0; n < (day < 30 ? 3 + ((day * 7) % 8) : 1 + (day % 4)); n++) {
            const when = new Date();
            when.setDate(when.getDate() - day);
            when.setHours(9 + n, 15, 0, 0);
            state.records.push({
              id: `sample-${day}-${n}`,
              source: n % 3 === 0 ? 'linkedin' : 'external',
              jobTitle: [
                'Backend Engineer',
                'AI Engineer',
                'Research Engineer',
                'Platform Engineer',
              ][n % 4],
              company: ['Example Labs', 'Northstar Systems', 'Acme Research'][day % 3],
              url: `https://careers.example.test/posting/${day * 1000 + n}`,
              submittedAt: when.toISOString(),
              evidence: 'Example submission confirmation',
              status: 'confirmed',
            });
          }
      });
      await write({ dailyGoal: 15 });
      await trackingSnapshot();
    }
  })();
  window.addEventListener('storage', (event) => {
    if (event.key === key) {
      const before = JSON.parse(event.oldValue || '{}'),
        after = JSON.parse(event.newValue || '{}'),
        diff = Object.fromEntries(
          [...new Set([...Object.keys(before), ...Object.keys(after)])]
            .filter((name) => JSON.stringify(before[name]) !== JSON.stringify(after[name]))
            .map((name) => [name, { oldValue: before[name], newValue: after[name] }]),
        );
      listeners.forEach((fn) => fn(diff, 'local'));
    }
  });
}
const controller = bridge;
// Preserve native popup/profile APIs, replacing only tracking's message path.
const localGet = base?.storage?.local?.get?.bind(base.storage.local),
  localSet = base?.storage?.local?.set?.bind(base.storage.local);
const oldChanged = base?.storage?.onChanged;
const api = window.chrome;
api.runtime.sendMessage = (async (message: any) => {
  if (message?.type?.startsWith('eze-tracking:') || message?.type === 'eze-custom:adjust-count') {
    await controller.ready;
    const logical = document.body?.dataset.trackingUrl || location.href;
    const frameId = window.parent !== window ? 1 : 0;
    const sender =
      message.type === 'eze-tracking:prepare' ||
      message.type === 'eze-tracking:confirm' ||
      message.type === 'eze-tracking:page-ready'
        ? { url: logical, tab: { id: 1 }, frameId }
        : undefined;
    return controller.send(message, sender);
  }
  return originalRuntime?.sendMessage?.(message) || { ok: true };
}) as any;
api.storage.local.get = (async (keys: any, callback?: any) => {
  const other = localGet ? await localGet(keys) : {};
  const all = { ...other, ...controller.get() };
  const values =
    keys == null
      ? all
      : typeof keys === 'object' && !Array.isArray(keys)
        ? { ...keys, ...all }
        : Object.fromEntries(
            (typeof keys === 'string' ? [keys] : keys).map((name: string) => [name, all[name]]),
          );
  callback?.(values);
  return values;
}) as any;
api.storage.local.set = (async (values: any, callback?: any) => {
  const tracked = Object.fromEntries(
      Object.entries(values).filter(([name]) => trackKeys.has(name)),
    ),
    other = Object.fromEntries(Object.entries(values).filter(([name]) => !trackKeys.has(name)));
  if (Object.keys(tracked).length) await controller.set(tracked);
  if (localSet && Object.keys(other).length) await localSet(other);
  callback?.();
}) as any;
api.storage.onChanged = {
  addListener(fn: EventListener) {
    controller.listeners.add(fn);
    if (oldChanged !== api.storage.onChanged) oldChanged?.addListener(fn);
  },
  removeListener(fn: EventListener) {
    controller.listeners.delete(fn);
    if (oldChanged !== api.storage.onChanged) oldChanged?.removeListener(fn);
  },
} as any;
window.EZE_TRACKING_BRIDGE = controller;
