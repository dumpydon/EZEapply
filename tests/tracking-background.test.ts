import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { APPLICATION_COUNTS_KEY } from '../src/types';
import {
  TRACKING_CACHE_KEY,
  TRACKING_DAILY_TOTALS_KEY,
  TRACKING_INTENTS_KEY,
} from '../src/tracking-types';
import { localDayKey } from '../src/tracking-model';
type Listener = (...args: any[]) => any;
let data: Record<string, any>,
  session: Record<string, any>,
  messages: Listener[],
  changes: Listener[],
  removed: Listener[];
const view = { url: 'chrome-extension://test/analytics.html' };
const content = (url = 'https://www.linkedin.com/jobs/view/123456/', tab = 7, frame = 0) => ({
  url,
  tab: { id: tab },
  frameId: frame,
  documentId: 'document-a',
});
const intent = (id = 'attempt-123456', url = 'https://www.linkedin.com/jobs/view/123456/') => ({
  id,
  url,
  jobTitle: 'Research Engineer',
  company: 'Example',
  source: url.includes('linkedin.com') ? 'linkedin' : 'external',
});
async function send(message: unknown, sender: any = view): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tracking did not respond')), 2000);
    messages.forEach((fn) =>
      fn(message, sender, (value: unknown) => {
        clearTimeout(timer);
        resolve(value);
      }),
    );
  });
}
async function snapshot() {
  return (await send({ type: 'eze-tracking:snapshot' })).snapshot;
}
async function confirm(id = 'attempt-123456', sender = content()) {
  await send({ type: 'eze-tracking:prepare', intent: intent(id, sender.url) }, sender);
  return send(
    { type: 'eze-tracking:confirm', intentId: id, evidence: 'Your application was submitted.' },
    sender,
  );
}
async function restart() {
  messages = [];
  changes = [];
  removed = [];
  vi.resetModules();
  const { installTrackingBackground } = await import('../src/tracking-background');
  installTrackingBackground();
  await snapshot();
}
beforeEach(async () => {
  data = { appliedList: [], dailyGoal: 10 };
  session = {};
  messages = [];
  changes = [];
  removed = [];
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: (p: string) => `chrome-extension://test/${p}`,
      onMessage: { addListener: (fn: Listener) => messages.push(fn) },
    },
    storage: {
      local: {
        get: async () => structuredClone(data),
        set: async (values: Record<string, unknown>) => {
          const diff = Object.fromEntries(
            Object.entries(values).map(([key, newValue]) => [
              key,
              { oldValue: data[key], newValue },
            ]),
          );
          Object.assign(data, structuredClone(values));
          changes.forEach((fn) => fn(diff, 'local'));
        },
      },
      session: {
        get: async () => structuredClone(session),
        set: async (values: Record<string, unknown>) => {
          Object.assign(session, structuredClone(values));
        },
      },
      onChanged: { addListener: (fn: Listener) => changes.push(fn) },
    },
    tabs: { onRemoved: { addListener: (fn: Listener) => removed.push(fn) } },
  });
  await restart();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('durable submission ledger and worker boundary', () => {
  it('records both submission channels and publishes their combined count without adding native tracker records', async () => {
    expect((await confirm()).ok).toBe(true);
    expect(
      (
        await confirm(
          'external-attempt',
          content('https://careers.example.test/apply?jobId=456789', 8),
        )
      ).ok,
    ).toBe(true);
    const result = await snapshot();
    expect(result.records.map((r: any) => r.source).sort()).toEqual(['external', 'linkedin']);
    expect(data[TRACKING_DAILY_TOTALS_KEY][localDayKey()]).toMatchObject({
      total: 2,
      linkedin: 1,
      external: 1,
      unknown: 0,
    });
    expect(data.appliedList).toEqual([]);
  });
  it('requires a saved tab/frame intent and confirmation, and deduplicates repeated and concurrent success reports', async () => {
    expect(
      (
        await send(
          { type: 'eze-tracking:confirm', intentId: 'none', evidence: 'Application sent' },
          content(),
        )
      ).error,
    ).toContain('No recent submission');
    await send({ type: 'eze-tracking:prepare', intent: intent() }, content());
    expect((await snapshot()).records).toHaveLength(0);
    const request = {
      type: 'eze-tracking:confirm',
      intentId: 'attempt-123456',
      evidence: 'Application sent',
    };
    const results = await Promise.all([
      send(request, content()),
      send(request, content()),
      send(request, content()),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect((await snapshot()).records).toHaveLength(1);
  });
  it('preserves a pending submission through a worker restart and same-origin navigation', async () => {
    const sender = content('https://careers.example.test/apply?jobId=456789');
    await send(
      { type: 'eze-tracking:prepare', intent: intent('pending-external', sender.url) },
      sender,
    );
    await restart();
    const target = content('https://careers.example.test/thank-you');
    expect((await send({ type: 'eze-tracking:page-ready' }, target)).intent.id).toBe(
      'pending-external',
    );
    expect(
      (
        await send(
          {
            type: 'eze-tracking:confirm',
            intentId: 'pending-external',
            evidence: 'Thank you for applying',
          },
          target,
        )
      ).ok,
    ).toBe(true);
    await restart();
    expect((await snapshot()).records).toHaveLength(1);
    expect((await send({ type: 'eze-tracking:page-ready' }, target)).intent).toBeUndefined();
  });
  it('rejects cross-origin, other-frame, wrong-source and unauthorized history/goal requests', async () => {
    expect(
      (
        await send(
          { type: 'eze-tracking:prepare', intent: { ...intent(), source: 'external' } },
          content(),
        )
      ).error,
    ).toContain('source');
    await send({ type: 'eze-tracking:prepare', intent: intent() }, content());
    expect(
      (
        await send(
          { type: 'eze-tracking:confirm', intentId: 'attempt-123456', evidence: 'Sent' },
          content('https://another.test/done'),
        )
      ).error,
    ).toContain('No recent');
    expect(
      (
        await send(
          { type: 'eze-tracking:confirm', intentId: 'attempt-123456', evidence: 'Sent' },
          content(undefined, 7, 2),
        )
      ).error,
    ).toContain('No recent');
    expect((await send({ type: 'eze-tracking:snapshot' }, content())).error).toContain(
      'Open EZEapply',
    );
    expect((await send({ type: 'eze-tracking:set-goal', goal: 30 }, content())).error).toContain(
      'Open EZEapply',
    );
  });
  it('expires stale intents and removes all pending frames when their tab closes', async () => {
    await send({ type: 'eze-tracking:prepare', intent: intent() }, content());
    session[TRACKING_INTENTS_KEY]['7:0'].intent.createdAt = new Date(
      Date.now() - 31 * 60 * 1000,
    ).toISOString();
    expect((await send({ type: 'eze-tracking:page-ready' }, content())).intent).toBeUndefined();
    await send({ type: 'eze-tracking:prepare', intent: intent() }, content());
    removed.forEach((fn) => fn(7));
    await vi.waitFor(() => expect(session[TRACKING_INTENTS_KEY]['7:0']).toBeUndefined());
  });
  it('imports historic records honestly and upgrades an overlapping native callback to a known source', async () => {
    data.appliedList = [
      {
        jobTitle: 'Research Engineer',
        companyName: 'Example',
        jobLink: 'https://www.linkedin.com/jobs/search/?currentJobId=123456',
        date: new Date().toString(),
      },
    ];
    expect((await snapshot()).records[0]).toMatchObject({ source: 'unknown', status: 'imported' });
    await confirm();
    const result = await snapshot();
    expect(result.records).toHaveLength(1);
    expect(result.records[0].source).toBe('linkedin');
    expect(data.appliedList).toHaveLength(1);
    expect(data[TRACKING_DAILY_TOTALS_KEY][localDayKey()].total).toBe(1);
  });
  it('restores the history and derived caches after local cache removal', async () => {
    await confirm();
    await send({ type: 'eze-tracking:set-goal', goal: 25 });
    data = {};
    await restart();
    expect((await snapshot()).records).toHaveLength(1);
    expect(data.dailyGoal).toBe(25);
    expect(data[TRACKING_CACHE_KEY].goalHistory[localDayKey()]).toBe(25);
  });
  it('validates goals, shares the native goal and preserves history across restart', async () => {
    for (const goal of [0, -1, 1.5, 10001, '20'])
      expect((await send({ type: 'eze-tracking:set-goal', goal })).error).toContain('daily goal');
    expect((await send({ type: 'eze-tracking:set-goal', goal: 30 })).ok).toBe(true);
    await restart();
    expect((await snapshot()).goal).toBe(30);
    expect(data.dailyGoal).toBe(30);
  });
  it('serializes manual corrections with automatic captures, including the zero floor', async () => {
    const { adjustTrackingCount } = await import('../src/tracking-store');
    await Promise.all([
      confirm(),
      adjustTrackingCount(1, localDayKey()),
      adjustTrackingCount(1, localDayKey()),
    ]);
    let result = await snapshot();
    expect(result.adjustments[localDayKey()]).toBe(2);
    expect(data[TRACKING_DAILY_TOTALS_KEY][localDayKey()].total).toBe(3);
    await Promise.all(Array.from({ length: 6 }, () => adjustTrackingCount(-1, localDayKey())));
    result = await snapshot();
    expect(result.adjustments[localDayKey()]).toBe(-1);
    expect(data[TRACKING_DAILY_TOTALS_KEY][localDayKey()].total).toBe(0);
    expect(data[APPLICATION_COUNTS_KEY][localDayKey()]).toBe(-1);
  });
});
