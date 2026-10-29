import { APPLICATION_COUNTS_KEY } from './types';
import { dailyTotals, localDayKey, mergeRecords, sanitizedURL, validDay } from './tracking-model';
import {
  TRACKING_CACHE_KEY,
  TRACKING_DAILY_TOTALS_KEY,
  type ApplicationRecord,
  type TrackingSnapshot,
} from './tracking-types';

interface LedgerState {
  version: 1;
  records: ApplicationRecord[];
  goal: number;
  goalHistory: Record<string, number>;
  adjustments: Record<string, number>;
}
const empty = (): LedgerState => ({
  version: 1,
  records: [],
  goal: 10,
  goalHistory: {},
  adjustments: {},
});
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('eze-application-history', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('data');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function short(value: unknown, limit = 300): string {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f]/g, ' ')
        .trim()
        .slice(0, limit)
    : '';
}
function integers(input: unknown, min: number, max: number): Record<string, number> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input).filter(
      ([day, value]) => validDay(day) && Number.isInteger(value) && value >= min && value <= max,
    ),
  );
}
function validatedRecord(raw: unknown): ApplicationRecord | undefined {
  if (!raw || typeof raw !== 'object') return;
  const value = raw as Partial<ApplicationRecord>,
    date = new Date(value.submittedAt || '');
  if (
    !short(value.id, 200) ||
    Number.isNaN(date.getTime()) ||
    !['linkedin', 'external', 'unknown'].includes(value.source || '') ||
    !['confirmed', 'imported', 'manual'].includes(value.status || '')
  )
    return;
  return {
    id: short(value.id, 200),
    jobTitle: short(value.jobTitle),
    company: short(value.company),
    url: sanitizedURL(value.url),
    submittedAt: date.toISOString(),
    source: value.source!,
    status: value.status!,
    evidence: short(value.evidence, 500),
  };
}
function stateFrom(raw: unknown): LedgerState {
  if (!raw || typeof raw !== 'object') return empty();
  const value = raw as Partial<LedgerState>;
  return {
    version: 1,
    records: Array.isArray(value.records)
      ? value.records.map(validatedRecord).filter((record): record is ApplicationRecord => !!record)
      : [],
    goal:
      Number.isInteger(value.goal) && value.goal! >= 1 && value.goal! <= 10000 ? value.goal! : 10,
    goalHistory: integers(value.goalHistory, 1, 10000),
    adjustments: integers(value.adjustments, -99999, 99999),
  };
}
async function read(): Promise<LedgerState> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('data').objectStore('data').get('state');
      request.onsuccess = () => resolve(stateFrom(request.result));
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
async function write(state: LedgerState): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('data', 'readwrite');
      tx.objectStore('data').put(state, 'state');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Application history save was interrupted.'));
    });
  } finally {
    db.close();
  }
}
function hash(value: string): string {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}
export function legacyRecords(raw: unknown): ApplicationRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: ApplicationRecord[] = [];
  for (const value of raw) {
    if (!value || typeof value !== 'object') continue;
    if (typeof value.date !== 'string') continue;
    const date = new Date(value.date);
    if (Number.isNaN(date.getTime())) continue;
    const jobTitle = short(value.jobTitle),
      company = short(value.companyName),
      url = sanitizedURL(value.jobLink);
    if (!jobTitle && !company && !url) continue;
    const submittedAt = date.toISOString(),
      identity = JSON.stringify([value.id || '', url, jobTitle, company, submittedAt]),
      id = `legacy:${hash(identity)}${hash([...identity].reverse().join(''))}`;
    // A LinkedIn job URL does not prove that Easy Apply was used; external
    // applications may originate there too. Historic method stays unclassified.
    records.push({
      id,
      jobTitle,
      company,
      url,
      submittedAt,
      source: 'unknown',
      status: 'imported',
      evidence: 'Imported from your existing application tracker',
    });
  }
  return records;
}
let operations = Promise.resolve<unknown>(undefined);
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.catch(() => {}).then(operation);
  operations = next;
  return next;
}

/** Ledger writes and cache publication share one queue across all extension
 * views and submitted forms. Native application records are never fabricated. */
export function updateTracking<T>(
  update: (state: LedgerState) => T | Promise<T>,
  goalOverride?: number,
): Promise<{ result: T; snapshot: TrackingSnapshot }> {
  return serial(async () => {
    const state = await read(),
      before = JSON.stringify(state);
    const local = await chrome.storage.local.get([
      'appliedList',
      'dailyGoal',
      APPLICATION_COUNTS_KEY,
      TRACKING_CACHE_KEY,
      TRACKING_DAILY_TOTALS_KEY,
    ]);
    state.records = mergeRecords([...state.records, ...legacyRecords(local.appliedList)]);
    state.adjustments =
      local[APPLICATION_COUNTS_KEY] === undefined
        ? state.adjustments
        : integers(local[APPLICATION_COUNTS_KEY], -99999, 99999);
    const nativeGoal = local.dailyGoal;
    const goal =
      goalOverride ??
      (typeof nativeGoal === 'number' &&
      Number.isInteger(nativeGoal) &&
      nativeGoal >= 1 &&
      nativeGoal <= 10000
        ? nativeGoal
        : state.goal);
    state.goal = goal;
    const today = localDayKey();
    if (state.goalHistory[today] !== goal) state.goalHistory[today] = goal;
    const result = await update(state);
    state.records = mergeRecords(state.records);
    if (JSON.stringify(state) !== before) await write(state);
    const snapshot: TrackingSnapshot = {
      records: state.records,
      adjustments: state.adjustments,
      goal: state.goal,
      goalHistory: state.goalHistory,
    };
    const values: Record<string, unknown> = {};
    if (JSON.stringify(local[TRACKING_CACHE_KEY]) !== JSON.stringify(snapshot))
      values[TRACKING_CACHE_KEY] = snapshot;
    const totals = dailyTotals(snapshot);
    if (JSON.stringify(local[TRACKING_DAILY_TOTALS_KEY]) !== JSON.stringify(totals))
      values[TRACKING_DAILY_TOTALS_KEY] = totals;
    if (local.dailyGoal !== state.goal) values.dailyGoal = state.goal;
    if (JSON.stringify(local[APPLICATION_COUNTS_KEY] || {}) !== JSON.stringify(state.adjustments))
      values[APPLICATION_COUNTS_KEY] = state.adjustments;
    if (Object.keys(values).length) await chrome.storage.local.set(values);
    return { result, snapshot };
  });
}
export async function trackingSnapshot(): Promise<TrackingSnapshot> {
  return (await updateTracking(() => {})).snapshot;
}
export async function setTrackingGoal(goal: unknown): Promise<TrackingSnapshot> {
  if (!Number.isInteger(goal) || (goal as number) < 1 || (goal as number) > 10000)
    throw new Error('Choose a daily goal between 1 and 10,000 applications.');
  return (await updateTracking(() => {}, goal as number)).snapshot;
}

/** Manual corrections use the ledger's queue too, so concurrent automatic
 * confirmations cannot race the displayed count or its zero floor. */
export async function adjustTrackingCount(
  delta: unknown,
  day: unknown,
): Promise<{ ok: true; count: number }> {
  if (delta !== 1 && delta !== -1) throw new Error('Adjust the application count one at a time.');
  const { result } = await updateTracking((state) => {
    const today = localDayKey();
    if (day !== today) throw new Error('The day changed. Reopen EZEapply and try again.');
    const snapshot: TrackingSnapshot = { ...state };
    const before = dailyTotals(snapshot)[today]?.total || 0;
    const step = delta === -1 && before === 0 ? 0 : delta;
    const next = (state.adjustments[today] || 0) + step;
    if (Math.abs(next) > 99999) throw new Error('The daily count is at its limit.');
    state.adjustments[today] = next;
    return Math.max(0, before + step);
  });
  return { ok: true, count: result };
}
