import {
  composedParent,
  CONTROL_SELECTOR,
  fieldControlCount,
  fieldInstructions,
} from './form-labels';
import { matchingTerms, monetaryFormat } from './matching-terms';

function visible(element: Element): boolean {
  for (let node: Element | null = element; node; node = composedParent(node)) {
    if (
      node.hasAttribute('hidden') ||
      node.hasAttribute('inert') ||
      node.getAttribute('aria-hidden') === 'true'
    )
      return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse'
    )
      return false;
  }
  return element.isConnected;
}

/** Only plain generated text is meaningful here; ignore URLs, counters and icons. */
function generatedText(content: string): string {
  if (!/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/.test(content.trim())) return '';
  return content
    .trim()
    .slice(1, -1)
    .replace(/\\([\da-f]{1,6})\s?/gi, (_match, hex: string) => {
      const point = parseInt(hex, 16);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    })
    .replace(/\\(.)/g, '$1');
}

/** Inspect one field only, including CSS-rendered affixes that textContent misses. */
export function fieldFormatHints(control: HTMLElement): string[] {
  const hints = new Set<string>();
  const add = (value: string | null | undefined) => {
    const text = value?.replace(/\s+/g, ' ').trim();
    if (text && text.length <= 500) hints.add(text);
  };
  add(fieldInstructions(control));
  add(control.getAttribute('placeholder'));
  add(control.getAttribute('aria-description'));
  let scope: Element = control;
  for (let depth = 0; depth < 5; depth++) {
    const parent = composedParent(scope);
    if (
      !parent ||
      parent.matches('form,body,html,main,section,dialog,[role="dialog"]') ||
      fieldControlCount(parent) !== 1
    )
      break;
    scope = parent;
    if (
      scope.matches(
        '[data-automation-id^="formField"],.form-group,.form-field,.field,.application-question,[data-testid="field"]',
      )
    )
      break;
  }
  const win = control.ownerDocument.defaultView!;
  const supportsPseudo = !!win.CSS?.supports?.('selector(::after)');
  const nodes = [scope, ...scope.querySelectorAll('*')].slice(0, 80);
  for (const node of nodes) {
    if (
      node !== control &&
      node.matches(`${CONTROL_SELECTOR},button,a,script,style,[role="option"]`)
    )
      continue;
    if (!visible(node)) continue;
    add(
      [...node.childNodes]
        .filter((child) => child.nodeType === 3)
        .map((child) => child.textContent || '')
        .join(' '),
    );
    for (const attribute of ['data-unit', 'data-suffix', 'data-prefix'])
      add(node.getAttribute(attribute));
    if (supportsPseudo)
      for (const pseudo of ['::before', '::after']) {
        const style = win.getComputedStyle(node, pseudo);
        if (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.visibility !== 'collapse'
        )
          add(generatedText(style.content));
      }
  }
  return [...hints];
}

/** Currency is not an amount scale: "INR" plus "lacs per annum" means lakhs.
 * Keep raw labels as aliases, but make the complete visible format primary so
 * an exact INR-only alias cannot win over a lakh suffix. Values never convert. */
export function fieldMatchingLabels(
  control: HTMLElement,
  labels: string[],
): { labels: string[]; blocked?: string } {
  const primary = labels[0];
  if (!primary || !matchingTerms(primary).compensation) return { labels };
  const signals = [primary, ...fieldFormatHints(control)].map(monetaryFormat);
  const currencies = [...new Set(signals.flatMap((signal) => signal.currencies))];
  const scales = [...new Set(signals.flatMap((signal) => signal.scales))];
  const periods = [...new Set(signals.flatMap((signal) => signal.periods))];
  if (currencies.length > 1 || scales.length > 1 || periods.length > 1)
    return {
      labels,
      blocked:
        'The field shows conflicting currency, amount-scale or pay-period hints; review its required format',
    };
  const periodText = {
    year: 'per annum',
    month: 'per month',
    week: 'per week',
    day: 'per day',
    hour: 'per hour',
  };
  const hint = [currencies[0], scales[0], periods[0] && periodText[periods[0]]]
    .filter(Boolean)
    .join(' ');
  if (!hint) return { labels };
  const full = `${primary} · ${hint}`,
    before = matchingTerms(primary),
    after = matchingTerms(full);
  if (
    before.currency === after.currency &&
    before.amountUnit === after.amountUnit &&
    before.payPeriod === after.payPeriod
  )
    return { labels };
  return { labels: [full, ...labels] };
}
