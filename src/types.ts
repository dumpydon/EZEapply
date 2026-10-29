export interface CustomField {
  id: string;
  label: string;
  value: string;
  aliases: string[];
  exclude: string[];
  category: string;
  enabled: boolean;
  /** Phrase mode also matches equivalent core keywords; exact remains strict. */
  matchMode: 'phrase' | 'exact';
  /** Empty means every site. Otherwise an exact hostname or its subdomains. */
  scope: string;
  /** Semantic HTML autocomplete tokens for profile-derived fields only. */
  autocomplete?: string[];
  /** Equivalent native option values, e.g. India / IN. */
  valueAliases?: string[];
}

export interface ProfileFields {
  fields: CustomField[];
  autoFill: boolean;
  /** Removed derived shortcuts; underlying profile values stay available. */
  hiddenBuiltIns?: string[];
  /** Visual order only; includes custom IDs and derived shortcut IDs. */
  fieldOrder?: string[];
  /** Explicit edits to individual profile shortcuts, independent of other formats. */
  profileOverrides?: CustomField[];
}

export interface CustomStore {
  version: 1;
  profiles: Record<string, ProfileFields>;
}

export interface ProfileContext {
  id: string;
  name: string;
  personal: Record<string, unknown>;
}

export interface Question {
  id: string;
  label: string;
  kind: string;
  filled: boolean;
  matchedField?: string;
  reason?: string;
  canDraftWithAI?: boolean;
  /** Browser document identity prevents opening a stale question after navigation. */
  documentId?: string;
}

export interface FillReport {
  filled: number;
  skipped: number;
  questions: Question[];
  error?: string;
  warnings?: string[];
  tabId?: number;
}

export const STORAGE_KEY = 'eze.customFields.v1';
export const MESSAGE_PREFIX = 'eze-custom:';
/** The floating restore button is optional; absent or invalid values mean off. */
export const PANEL_RESTORE_KEY = 'eze.showFloatingRestore';
/** Explicit opt-in: uncheck company-follow choices inside LinkedIn applications. */
export const LINKEDIN_NOFOLLOW_KEY = 'eze.linkedin.disableAutoFollow';
/** Signed manual corrections to the daily counter; never fake tracker records. */
export const APPLICATION_COUNTS_KEY = 'eze.applicationCountAdjustments.v1';
