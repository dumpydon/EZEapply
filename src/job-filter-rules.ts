export const JOB_FILTERS_KEY = 'eze.linkedin.jobFilters.v1';

interface JobFilterList {
  enabled: boolean;
  keywords: string[];
}

export interface JobFilterSettings {
  titles: JobFilterList;
  companies: JobFilterList;
  exceptions: JobFilterList;
}

const TITLE_WORD = /[\p{L}\p{N}\p{M}\p{Pc}+#]/u.source;

export function normalizeJobFilterText(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

export function compileTitleFilter(keyword: string): RegExp {
  const phrase = normalizeJobFilterText(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<!${TITLE_WORD})${phrase}(?!${TITLE_WORD})`, 'u');
}

const hasKeyword = (text: string) => /[\p{L}\p{N}]/u.test(text);

export function keepRuleTerms(rule: string): string[] {
  // A standalone plus joins phrases. Preserve literal plus signs in titles such as C++.
  const terms = rule.split(/(?:^|\s)\+(?=\s|$)/u).map(normalizeJobFilterText);
  return terms.every(hasKeyword) ? terms : [];
}

function readFilterList(value: unknown, valid = hasKeyword): JobFilterList {
  const saved = value as Partial<JobFilterList> | null | undefined;
  const keywords: string[] = [];
  const seen = new Set<string>();
  if (Array.isArray(saved?.keywords)) {
    for (const item of saved.keywords) {
      if (typeof item !== 'string') continue;
      const keyword = item.trim();
      const normalized = normalizeJobFilterText(keyword);
      if (!valid(normalized) || seen.has(normalized)) continue;
      seen.add(normalized);
      keywords.push(keyword);
    }
  }
  return { enabled: saved?.enabled === true && keywords.length > 0, keywords };
}

export function readJobFilters(value: unknown): JobFilterSettings {
  const saved = value as Partial<JobFilterSettings> | null | undefined;
  return {
    // The original settings stored the title filter directly under this key.
    titles: readFilterList(saved?.titles ?? value),
    companies: readFilterList(saved?.companies),
    exceptions: readFilterList(saved?.exceptions, (rule) => keepRuleTerms(rule).length > 0),
  };
}
