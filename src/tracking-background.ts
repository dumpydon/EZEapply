import { APPLICATION_COUNTS_KEY } from './types';
import { sameApplication, sanitizedURL } from './tracking-model';
import { setTrackingGoal, trackingSnapshot, updateTracking } from './tracking-store';
import {
  TRACKING_CACHE_KEY,
  TRACKING_DAILY_TOTALS_KEY,
  TRACKING_INTENTS_KEY,
  type ApplicationRecord,
  type SubmissionIntent,
} from './tracking-types';

const TTL = 30 * 60 * 1000;
interface Pending {
  intent: SubmissionIntent;
  recordId?: string;
}
let intentOperations = Promise.resolve<unknown>(undefined);
function serialIntent<T>(operation: () => Promise<T>): Promise<T> {
  const next = intentOperations.catch(() => {}).then(operation);
  intentOperations = next;
  return next;
}
function contentIdentity(sender: chrome.runtime.MessageSender): { key: string; url: URL } {
  if (!Number.isInteger(sender.tab?.id) || !Number.isInteger(sender.frameId) || !sender.url)
    throw new Error('Submission tracking is available only on application webpages.');
  const safe = sanitizedURL(sender.url);
  if (!safe) throw new Error('This page cannot be tracked.');
  return { key: `${sender.tab!.id}:${sender.frameId}`, url: new URL(safe) };
}
function extensionView(sender: chrome.runtime.MessageSender): boolean {
  return !!sender.url && sender.url.startsWith(chrome.runtime.getURL(''));
}
function text(value: unknown, max = 300): string {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f]/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}
function intentFrom(raw: unknown, url: URL): SubmissionIntent {
  if (!raw || typeof raw !== 'object') throw new Error('The application could not be identified.');
  const value = raw as Record<string, unknown>,
    id = text(value.id, 160),
    safe = sanitizedURL(value.url);
  if (!id || id.length < 8 || !safe || new URL(safe).origin !== url.origin)
    throw new Error('The application page changed. Try again on its current page.');
  const linkedin = /(^|\.)linkedin\.com$/i.test(url.hostname);
  if (value.source !== (linkedin ? 'linkedin' : 'external'))
    throw new Error('The application source could not be verified.');
  return {
    id,
    url: safe,
    jobTitle: text(value.jobTitle),
    company: text(value.company),
    source: linkedin ? 'linkedin' : 'external',
    createdAt: new Date().toISOString(),
  };
}
async function pending(): Promise<Record<string, Pending>> {
  const data = await chrome.storage.session.get(TRACKING_INTENTS_KEY),
    raw = data[TRACKING_INTENTS_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(([key, value]) => {
      if (!/^\d+:\d+$/.test(key) || !value || typeof value !== 'object') return false;
      const item = value as Pending,
        created = new Date(item.intent?.createdAt || '').getTime();
      return (
        Number.isFinite(created) &&
        Date.now() - created >= 0 &&
        Date.now() - created < TTL &&
        !!sanitizedURL(item.intent?.url)
      );
    }),
  ) as Record<string, Pending>;
}
async function savePending(values: Record<string, Pending>): Promise<void> {
  await chrome.storage.session.set({ [TRACKING_INTENTS_KEY]: values });
}

export function installTrackingBackground(): void {
  chrome.runtime.onMessage.addListener((raw, sender, respond) => {
    if (
      !raw ||
      typeof raw !== 'object' ||
      typeof raw.type !== 'string' ||
      !raw.type.startsWith('eze-tracking:')
    )
      return;
    const work = async () => {
      if (raw.type === 'eze-tracking:snapshot') {
        if (!extensionView(sender)) throw new Error('Open EZEapply to view application history.');
        return { ok: true, snapshot: await trackingSnapshot() };
      }
      if (raw.type === 'eze-tracking:set-goal') {
        if (!extensionView(sender)) throw new Error('Open EZEapply to change your daily goal.');
        const snapshot = await setTrackingGoal(raw.goal);
        return { ok: true, goal: snapshot.goal, snapshot };
      }
      if (
        !['eze-tracking:prepare', 'eze-tracking:confirm', 'eze-tracking:page-ready'].includes(
          raw.type,
        )
      )
        throw new Error('Unknown application tracking action.');
      const { key, url } = contentIdentity(sender);
      return serialIntent(async () => {
        const values = await pending();
        if (raw.type === 'eze-tracking:prepare') {
          const intent = intentFrom(raw.intent, url);
          values[key] = { intent };
          await savePending(values);
          return { ok: true, intent };
        }
        const item = values[key];
        if (raw.type === 'eze-tracking:page-ready') {
          if (!item || item.recordId || new URL(item.intent.url).origin !== url.origin)
            return { ok: true };
          return { ok: true, intent: item.intent };
        }
        if (
          !item ||
          raw.intentId !== item.intent.id ||
          new URL(item.intent.url).origin !== url.origin
        )
          throw new Error('No recent submission was found for this application page.');
        const evidence = text(raw.evidence, 500);
        if (!evidence)
          throw new Error(
            'A submission confirmation is required before counting this application.',
          );
        const { result } = await updateTracking((state) => {
          if (item.recordId) {
            const record = state.records.find((record) => record.id === item.recordId);
            if (record) return { record, duplicate: true };
          }
          const candidate: ApplicationRecord = {
            id: `capture:${item.intent.id}`,
            url: item.intent.url,
            jobTitle: item.intent.jobTitle,
            company: item.intent.company,
            source: item.intent.source,
            submittedAt: new Date().toISOString(),
            status: 'confirmed',
            evidence,
          };
          const existing = state.records.find((record) => sameApplication(record, candidate));
          if (existing?.status === 'confirmed') return { record: existing, duplicate: true };
          if (existing) state.records = state.records.filter((record) => record.id !== existing.id);
          // Reconcile a previously imported native record instead of counting
          // the same application again when both watchers detect confirmation.
          const record = existing ? { ...candidate, submittedAt: existing.submittedAt } : candidate;
          state.records.push(record);
          return { record, duplicate: !!existing };
        });
        item.recordId = result.record.id;
        values[key] = item;
        await savePending(values);
        return { ok: true, ...result };
      });
    };
    void work().then(respond, (error) =>
      respond({
        error: error instanceof Error ? error.message : 'Application history could not be updated.',
      }),
    );
    return true;
  });
  // Only source data causes recomputation; publishing the derived cache cannot
  // feed back into its own observer. Recovery also restores a cleared cache.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === 'local' &&
      (changes.appliedList ||
        changes[APPLICATION_COUNTS_KEY] ||
        changes.dailyGoal ||
        (changes[TRACKING_CACHE_KEY] && !changes[TRACKING_CACHE_KEY].newValue) ||
        (changes[TRACKING_DAILY_TOTALS_KEY] && !changes[TRACKING_DAILY_TOTALS_KEY].newValue))
    )
      void trackingSnapshot().catch(() => {});
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    void serialIntent(async () => {
      const values = await pending();
      for (const key of Object.keys(values)) if (key.startsWith(`${tabId}:`)) delete values[key];
      await savePending(values);
    }).catch(() => {});
  });
  void trackingSnapshot().catch(() => {});
}
