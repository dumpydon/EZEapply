import type {
  AnalyticsBin,
  AnalyticsSummary,
  ApplicationRecord,
  TrackingSnapshot,
} from './tracking-types';

export function localDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [year, month, date] = day.split('-').map(Number),
    parsed = new Date(year, month - 1, date);
  return year >= 1970 && localDayKey(parsed) === day;
}
export function sanitizedURL(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 8192) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.username = '';
    url.password = '';
    url.hash = '';
    const retained = new URLSearchParams();
    for (const key of [
      'currentJobId',
      'gh_jid',
      'jobId',
      'jobid',
      'job_id',
      'jid',
      'reqId',
      'requisitionId',
      'activeJob',
      'postingId',
    ]) {
      const value = url.searchParams.get(key);
      if (value && /^[\w.-]{1,160}$/.test(value)) retained.set(key, value);
    }
    url.search = retained.toString();
    return url.href;
  } catch {
    return '';
  }
}
export function applicationURLKey(raw: string): string {
  const safe = sanitizedURL(raw);
  if (!safe) return '';
  const url = new URL(safe);
  if (/(^|\.)linkedin\.com$/i.test(url.hostname)) {
    const id =
      /\/jobs\/view\/(?:[^/]*-)?(\d+)(?:\/|$)/.exec(url.pathname)?.[1] ||
      url.searchParams.get('currentJobId');
    if (id) return `linkedin:${id}`;
  }
  return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '')}${url.search}`;
}
function label(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
function dayOf(record: ApplicationRecord): string {
  return localDayKey(new Date(record.submittedAt));
}
function identifiedURL(key: string): boolean {
  return (
    /^linkedin:\d+$/.test(key) ||
    /[/?](?:[^/?]*\d{4,}[^/?]*)(?:$|[/?])|[?&](?:currentJobId|jobId|jobid|job_id|jid|gh_jid|reqId|requisitionId|activeJob|postingId)=/i.test(
      key,
    )
  );
}
/** Stable identity wins; title/company is a fallback only when no two distinct
 * posting identifiers exist. This reconciles an imported history record with
 * the same application captured by the confirmation watcher. */
export function sameApplication(a: ApplicationRecord, b: ApplicationRecord): boolean {
  if (a.id === b.id) return true;
  if (dayOf(a) !== dayOf(b)) return false;
  const one = applicationURLKey(a.url),
    two = applicationURLKey(b.url);
  if (one && one === two) {
    if (identifiedURL(one)) return true;
    const titleA = label(a.jobTitle),
      titleB = label(b.jobTitle),
      companyA = label(a.company),
      companyB = label(b.company);
    return (
      !!titleA && !!titleB && !!companyA && !!companyB && titleA === titleB && companyA === companyB
    );
  }
  if (one && two && identifiedURL(one) && identifiedURL(two)) return false;
  return (
    !!label(a.jobTitle) &&
    !!label(a.company) &&
    label(a.jobTitle) === label(b.jobTitle) &&
    label(a.company) === label(b.company)
  );
}
export function mergeRecords(records: ApplicationRecord[]): ApplicationRecord[] {
  const ranked = [...records].sort(
    (a, b) =>
      Number(b.status === 'confirmed') - Number(a.status === 'confirmed') ||
      b.submittedAt.localeCompare(a.submittedAt) ||
      a.id.localeCompare(b.id),
  );
  const result: ApplicationRecord[] = [];
  const groups = new Map<string, ApplicationRecord[]>(),
    ids = new Set<string>();
  const keys = (record: ApplicationRecord) => {
    const day = dayOf(record),
      url = applicationURLKey(record.url),
      title = label(record.jobTitle),
      company = label(record.company);
    const strong = !!url && identifiedURL(url),
      urlKey = strong ? [JSON.stringify(['url', day, url])] : [];
    const metadata = title && company ? JSON.stringify([day, title, company]) : '';
    return {
      lookup: [...urlKey, ...(metadata ? [`${strong ? 'weak' : 'all'}:${metadata}`] : [])],
      index: [
        ...urlKey,
        ...(metadata ? [`all:${metadata}`, ...(!strong ? [`weak:${metadata}`] : [])] : []),
      ],
    };
  };
  for (const record of ranked) {
    if (ids.has(record.id)) continue;
    const identity = keys(record),
      candidates = new Set(identity.lookup.flatMap((key) => groups.get(key) || []));
    if ([...candidates].some((existing) => sameApplication(existing, record))) continue;
    ids.add(record.id);
    result.push(record);
    for (const key of identity.index) {
      const values = groups.get(key) || [];
      values.push(record);
      groups.set(key, values);
    }
  }
  return result.sort(
    (a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.id.localeCompare(b.id),
  );
}
export function dailyTotals(
  snapshot: TrackingSnapshot,
): Record<
  string,
  { total: number; linkedin: number; external: number; unknown: number; adjustment: number }
> {
  const totals: ReturnType<typeof dailyTotals> = {};
  const bin = (day: string) =>
    (totals[day] ||= { total: 0, linkedin: 0, external: 0, unknown: 0, adjustment: 0 });
  for (const record of snapshot.records) {
    const parsed = new Date(record.submittedAt);
    if (Number.isNaN(parsed.getTime())) continue;
    const item = bin(localDayKey(parsed));
    item[record.source]++;
    item.total++;
  }
  for (const [day, value] of Object.entries(snapshot.adjustments))
    if (validDay(day) && Number.isSafeInteger(value) && Math.abs(value) <= 99999) {
      const item = bin(day);
      item.adjustment = value;
      item.total = Math.max(0, item.total + value);
    }
  return totals;
}
function dayOffset(now: Date, offset: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
}
export function analyticsSummary(
  snapshot: TrackingSnapshot,
  days: number,
  now = new Date(),
): AnalyticsSummary {
  const period = Number.isInteger(days) && days >= 1 && days <= 366 ? days : 7;
  const totals = dailyTotals(snapshot),
    today = localDayKey(now);
  const history = Object.entries(snapshot.goalHistory)
    .filter(([day, goal]) => validDay(day) && Number.isInteger(goal) && goal >= 1 && goal <= 10000)
    .sort(([a], [b]) => a.localeCompare(b));
  const goalFor = (day: string) =>
    history.filter(([key]) => key <= day).at(-1)?.[1] || (day === today ? snapshot.goal : 0);
  const bins: AnalyticsBin[] = Array.from({ length: period }, (_, index) => {
    const day = localDayKey(dayOffset(now, index - period + 1));
    return {
      day,
      ...(totals[day] || { total: 0, linkedin: 0, external: 0, unknown: 0, adjustment: 0 }),
      goal: goalFor(day),
    };
  });
  const total = bins.reduce((sum, bin) => sum + bin.total, 0);
  const previousTotal = Array.from(
    { length: period },
    (_, index) => totals[localDayKey(dayOffset(now, index - period * 2 + 1))]?.total || 0,
  ).reduce((sum, count) => sum + count, 0);
  let streak = 0,
    offset = (totals[today]?.total || 0) > 0 ? 0 : -1;
  while (streak < 3660 && (totals[localDayKey(dayOffset(now, offset))]?.total || 0) > 0) {
    streak++;
    offset--;
  }
  const goals = bins.filter((bin) => bin.goal > 0);
  return {
    days: period,
    bins,
    total,
    previousTotal,
    growth: previousTotal === 0 ? null : ((total - previousTotal) / previousTotal) * 100,
    linkedin: bins.reduce((sum, bin) => sum + bin.linkedin, 0),
    external: bins.reduce((sum, bin) => sum + bin.external, 0),
    unknown: bins.reduce((sum, bin) => sum + bin.unknown, 0),
    adjustment: bins.reduce((sum, bin) => sum + bin.adjustment, 0),
    streak,
    bestDay:
      bins
        .filter((bin) => bin.total > 0)
        .sort((a, b) => b.total - a.total || b.day.localeCompare(a.day))[0] || null,
    goalDays: goals.filter((bin) => bin.total >= bin.goal).length,
    goalAttainment: goals.length
      ? (goals.filter((bin) => bin.total >= bin.goal).length / goals.length) * 100
      : 0,
  };
}
