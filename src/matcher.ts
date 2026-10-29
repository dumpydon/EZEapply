import type { CustomField } from './types';
import { includesPhrase, normalize } from './matching-text';
import {
  aliasTerms,
  matchCompatibility,
  matchingTerms,
  savedMatchingTerms,
  sameKeywords,
} from './matching-terms';
export { includesPhrase, normalize } from './matching-text';

export function matchesScope(scope: string, hostname: string): boolean {
  if (!scope.trim()) return true;
  const target = scope
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  return hostname.toLowerCase() === target || hostname.toLowerCase().endsWith(`.${target}`);
}

function qualifier(text: string, variants: string[]): boolean {
  return variants.some((value) => includesPhrase(text, value));
}

/** Prevent a broad alias from erasing a meaningful distinction in a question. */
function contradicts(field: CustomField, question: string): boolean {
  const fieldLabel = normalize(field.label);
  const pairs: [string[], string[]][] = [
    [
      ['expected', 'desired', 'target'],
      ['current', 'present', 'last drawn', 'previous'],
    ],
    [
      ['first', 'given'],
      ['last', 'family', 'surname'],
    ],
    [['middle'], ['first', 'given', 'last', 'family', 'surname']],
    [
      ['without country code', 'national', 'number only', 'local number'],
      ['international', 'including country code', 'with country code'],
    ],
  ];
  return pairs.some(
    ([left, right]) =>
      (qualifier(fieldLabel, left) && qualifier(question, right)) ||
      (qualifier(fieldLabel, right) && qualifier(question, left)),
  );
}

export interface MatchResult {
  field?: CustomField;
  score: number;
  reason: string;
}

export function matchField(
  labels: string[],
  fields: CustomField[],
  hostname: string,
  autocomplete?: string,
): MatchResult {
  const uniqueQuestions = new Map<string, string>();
  for (const label of labels) {
    const normalized = normalize(label);
    if (normalized && !uniqueQuestions.has(normalized)) uniqueQuestions.set(normalized, label);
  }
  const questions = [...uniqueQuestions.keys()];
  const rawQuestions = [...uniqueQuestions.values()];
  const questionTerms = rawQuestions.map(matchingTerms);
  if (!questions.length && !autocomplete) return { score: 0, reason: 'No usable label' };
  const candidates: { field: CustomField; score: number; priority: number }[] = [];
  let differentUnits = false;
  let differentNoticeUnits = false;
  let differentMeaning = false;
  for (const field of fields) {
    if (!field.enabled || !field.value.trim() || !matchesScope(field.scope, hostname)) continue;
    // The primary, human-readable label controls exclusions, including qualifier conflicts.
    if (questions[0] && contradicts(field, questions[0])) continue;
    if (
      field.exclude.some((exclude) =>
        questions.some((question) => includesPhrase(question, normalize(exclude))),
      )
    )
      continue;
    let best = autocomplete && field.autocomplete?.includes(autocomplete) ? 180 : 0;
    let bestPriority = best ? 3 : 0;
    const fieldTerms = savedMatchingTerms(field.label, field.value);
    for (const rawAlias of [field.label, ...field.aliases]) {
      const alias = normalize(rawAlias);
      if (!alias) continue;
      const terms = aliasTerms(fieldTerms, matchingTerms(rawAlias));
      if (!terms) continue;
      questions.forEach((question, index) => {
        const exact = question === alias;
        const phrase = field.matchMode !== 'exact' && includesPhrase(question, alias);
        const keywords = field.matchMode !== 'exact' && sameKeywords(terms, questionTerms[index]);
        if (!exact && !phrase && !keywords) return;
        // Visible monetary labels govern format even when a lower-priority
        // machine name happens to match a broader alias.
        const units = questionTerms[0]?.topic ? questionTerms[0] : questionTerms[index];
        const { priority, reason } = matchCompatibility(terms, units);
        if (!priority) {
          if (reason === 'units') differentUnits = true;
          else if (reason === 'notice-units') differentNoticeUnits = true;
          else differentMeaning = true;
          return;
        }
        // A visible label wins over generic id/name attributes. Exact matches always win.
        const score =
          (exact ? 120 : keywords ? 90 : 65) +
          Math.min(keywords && !exact ? terms.keywords.length : alias.split(' ').length, 10) * 3 -
          index * 4;
        if (priority > bestPriority || (priority === bestPriority && score > best)) {
          best = score;
          bestPriority = priority;
        }
      });
    }
    if (best) candidates.push({ field, score: best, priority: bestPriority });
  }
  candidates.sort(
    (a, b) => b.priority - a.priority || b.score - a.score || a.field.id.localeCompare(b.field.id),
  );
  const first = candidates[0];
  if (!first)
    return {
      score: 0,
      reason: differentUnits
        ? 'Saved answers use different units. Save a matching INR or lakh/LPA variant. A generic CTC question can use a saved generic or lakh answer.'
        : differentNoticeUnits
          ? 'The saved notice-period answer uses different time units. Save a separate answer for days, weeks, or months.'
          : differentMeaning
            ? 'Saved answers describe a different pay period, component, experience type, or response format.'
            : 'No matching saved field',
    };
  // Explicit generic answers take precedence over the requested lakh fallback,
  // regardless of how similar each saved label happens to be.
  const peers = candidates.filter((candidate) => candidate.priority === first.priority);
  const conflict = peers.find(
    (candidate) =>
      candidate.field.value !== first.field.value && first.score - candidate.score <= 6,
  );
  if (conflict) {
    // A deliberately saved exact answer overrides an equivalent derived profile
    // default, while two conflicting user answers still require disambiguation.
    const user = peers.filter(
      (candidate) => !/^(builtin|profile):/.test(candidate.field.id) && candidate.score >= 120,
    );
    if (
      user.length === 1 &&
      peers.every(
        (candidate) => /^(builtin|profile):/.test(candidate.field.id) || candidate === user[0],
      )
    )
      return { field: user[0].field, score: user[0].score, reason: 'Matched your custom answer' };
    return {
      score: first.score,
      reason: 'Multiple saved answers match; refine their matching phrases',
    };
  }
  return {
    field: first.field,
    score: first.score,
    reason:
      first.priority === 1
        ? 'Matched saved CTC answer using the default lakh format'
        : 'Matched saved field',
  };
}
