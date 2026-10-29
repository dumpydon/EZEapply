export type ApplicationSource = 'linkedin' | 'external' | 'unknown';
export interface ApplicationRecord {
  id: string;
  source: ApplicationSource;
  jobTitle: string;
  company: string;
  url: string;
  submittedAt: string;
  evidence: string;
  status: 'confirmed' | 'imported' | 'manual';
}
export interface SubmissionIntent {
  id: string;
  url: string;
  jobTitle: string;
  company: string;
  source: 'linkedin' | 'external';
  createdAt: string;
}
export interface TrackingSnapshot {
  records: ApplicationRecord[];
  adjustments: Record<string, number>;
  goal: number;
  goalHistory: Record<string, number>;
}
export interface AnalyticsBin {
  day: string;
  linkedin: number;
  external: number;
  unknown: number;
  adjustment: number;
  total: number;
  goal: number;
}
export interface AnalyticsSummary {
  days: number;
  bins: AnalyticsBin[];
  total: number;
  previousTotal: number;
  /** Percent change; null when the previous period is empty. */
  growth: number | null;
  linkedin: number;
  external: number;
  unknown: number;
  adjustment: number;
  streak: number;
  bestDay: AnalyticsBin | null;
  goalDays: number;
  goalAttainment: number;
}
export const TRACKING_CACHE_KEY = 'eze.tracking.v1';
export const TRACKING_INTENTS_KEY = 'eze.tracking.pending.v1';
export const TRACKING_DAILY_TOTALS_KEY = 'eze.tracking.dailyTotals.v1';
