import { describe, expect, it } from 'vitest';
import {
  analyticsSummary,
  applicationURLKey,
  dailyTotals,
  localDayKey,
  mergeRecords,
  sameApplication,
  sanitizedURL,
  validDay,
} from '../src/tracking-model';
import type { ApplicationRecord, TrackingSnapshot } from '../src/tracking-types';
const now = new Date(2026, 9, 29, 12),
  date = (offset: number) => new Date(2026, 9, 29 + offset, 10).toISOString();
const record = (
  id: string,
  offset = 0,
  source: ApplicationRecord['source'] = 'external',
  extra: Partial<ApplicationRecord> = {},
): ApplicationRecord => ({
  id,
  source,
  jobTitle: `Role ${id}`,
  company: 'Example',
  url: `https://jobs.example.test/posting/${id}`,
  submittedAt: date(offset),
  status: 'confirmed',
  evidence: 'Your application was submitted',
  ...extra,
});
const snapshot = (
  records: ApplicationRecord[] = [],
  extra: Partial<TrackingSnapshot> = {},
): TrackingSnapshot => ({ records, adjustments: {}, goal: 10, goalHistory: {}, ...extra });
describe('application identities and analytics', () => {
  it('keeps posting identifiers but strips credentials, fragments and tracking parameters', () => {
    expect(
      sanitizedURL(
        'https://name:secret@www.linkedin.com/jobs/search/?currentJobId=123456&utm_source=private#draft',
      ),
    ).toBe('https://www.linkedin.com/jobs/search/?currentJobId=123456');
    expect(applicationURLKey('https://www.linkedin.com/jobs/view/engineer-123456/')).toBe(
      applicationURLKey('https://www.linkedin.com/jobs/search/?currentJobId=123456'),
    );
    expect(sanitizedURL('javascript:alert(1)')).toBe('');
    expect(sanitizedURL('file:///resume.pdf')).toBe('');
  });
  it('merges a confirmed capture and imported tracker callback, preserving the confirmed source', () => {
    const confirmed = record('capture', 0, 'linkedin', {
      url: 'https://www.linkedin.com/jobs/view/123456/',
    });
    const legacy = record('import', 0, 'unknown', {
      url: 'https://www.linkedin.com/jobs/search/?currentJobId=123456',
      status: 'imported',
      jobTitle: 'Slightly different title',
    });
    expect(mergeRecords([legacy, confirmed, confirmed])).toEqual([confirmed]);
  });
  it('does not merge distinct postings or unidentifiable submissions on a generic application URL', () => {
    const a = record('a', 0, 'external', {
      url: 'https://jobs.example.test/apply',
      jobTitle: '',
      company: '',
    });
    const b = { ...a, id: 'b' };
    expect(sameApplication(a, b)).toBe(false);
    expect(mergeRecords([a, b])).toHaveLength(2);
    expect(
      sameApplication(
        record('a', 0, 'external', { url: 'https://jobs.example.test/apply?jobId=1' }),
        record('b', 0, 'external', {
          url: 'https://jobs.example.test/apply?jobId=2',
          jobTitle: 'Role a',
        }),
      ),
    ).toBe(false);
  });
  it('uses title and company to reconcile source URLs only when distinct posting IDs are absent', () => {
    const a = record('a', 0, 'external', {
      url: 'https://example.test/apply',
      jobTitle: 'Backend Engineer',
    });
    const b = record('b', 0, 'unknown', {
      url: 'https://careers.example.test/',
      jobTitle: 'Backend Engineer',
      status: 'imported',
    });
    expect(sameApplication(a, b)).toBe(true);
    expect(sameApplication(a, { ...b, company: 'Other' })).toBe(false);
    expect(sameApplication(a, { ...b, submittedAt: date(-1) })).toBe(false);
  });
  it.each([7, 15, 30])(
    'produces %i zero-filled local-calendar bins and an equal previous period',
    (days) => {
      const data = snapshot([
        record('today'),
        record('first', 1 - days, 'linkedin'),
        record('previous', -days),
        record('older', -2 * days),
      ]);
      const summary = analyticsSummary(data, days, now);
      expect(summary.bins).toHaveLength(days);
      expect(summary.bins.at(-1)?.day).toBe('2026-10-29');
      expect(summary.total).toBe(2);
      expect(summary.previousTotal).toBe(1);
      expect(summary.growth).toBe(100);
    },
  );
  it('reports no fabricated growth percentage for an empty previous period', () => {
    expect(analyticsSummary(snapshot(), 7, now).growth).toBeNull();
    expect(analyticsSummary(snapshot([record('one')]), 7, now).growth).toBeNull();
    expect(analyticsSummary(snapshot([record('before', -7)]), 7, now).growth).toBe(-100);
  });
  it('keeps manual corrections unclassified, floors each day at zero, and calculates streak and best day', () => {
    const data = snapshot([record('a'), record('b', -1, 'linkedin'), record('c', -2)], {
      adjustments: { '2026-10-29': 2, '2026-10-28': -4 },
    });
    const totals = dailyTotals(data);
    expect(totals['2026-10-29']).toMatchObject({
      total: 3,
      external: 1,
      linkedin: 0,
      adjustment: 2,
    });
    expect(totals['2026-10-28'].total).toBe(0);
    const summary = analyticsSummary(data, 7, now);
    expect(summary.streak).toBe(1);
    expect(summary.bestDay?.day).toBe('2026-10-29');
    expect(summary.total).toBe(4);
  });
  it('uses only recorded goal history and applies a changed goal from its date onward', () => {
    const data = snapshot([record('a'), record('b', -1)], {
      goal: 1,
      goalHistory: { '2026-10-28': 2, '2026-10-29': 1 },
    });
    const summary = analyticsSummary(data, 7, now);
    expect(summary.bins.slice(0, -2).every((bin) => bin.goal === 0)).toBe(true);
    expect(summary.bins.at(-2)?.goal).toBe(2);
    expect(summary.goalDays).toBe(1);
    expect(summary.goalAttainment).toBe(50);
  });
  it('validates real calendar dates and preserves boundaries across months and years', () => {
    expect(validDay('2026-02-29')).toBe(false);
    expect(validDay('2024-02-29')).toBe(true);
    expect(validDay('__proto__')).toBe(false);
    expect(localDayKey(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(analyticsSummary(snapshot(), 7, new Date(2026, 0, 1, 12)).bins[0].day).toBe(
      '2025-12-26',
    );
  });
});
