/** Field-local signals only. Never borrow all the text of the surrounding form. */
export const CONTROL_SELECTOR =
  'input,textarea,select,[role="combobox"],[contenteditable="true"][role="textbox"],[contenteditable=""]';
export const FIELD_CONTAINER =
  '[data-automation-id="formField"], [data-automation-id^="formField-"], .form-group, .form-field, .field, .application-question, .jobs-easy-apply-form-element, .fb-dash-form-element, [data-testid="field"], [role="group"], [role="listitem"]';

export function isGenericPrompt(value: string): boolean {
  const text = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return (
    !text ||
    /^(?:(?:please )?(?:enter|type|write|add|provide|input)(?: your| the| an)?(?: answer| response| text| information)?(?: here)?|your answer|your response|answer(?: here)?|response|text|textbox|text field|short answer(?: text)?|long answer(?: text)?|search and select|select an option)$/.test(
      text,
    )
  );
}
function parentOf(element: Element): Element | null {
  return element.parentElement || (element.getRootNode() as ShadowRoot).host || null;
}
function reference(element: Element, id: string): Element | null {
  let scope = element.getRootNode() as Document | ShadowRoot;
  while (true) {
    const found = scope.getElementById(id);
    if (found) return found;
    if (!('host' in scope)) return null;
    scope = scope.host.getRootNode() as Document | ShadowRoot;
  }
}
function controlsWithin(container: Element | ShadowRoot): number {
  let count = [...container.querySelectorAll(CONTROL_SELECTOR)].filter(
    (control) =>
      control.getAttribute('type') !== 'hidden' &&
      !control.closest('[role="listbox"]') &&
      (!control.closest('[role="combobox"]') || control.closest('[role="combobox"]') === control),
  ).length;
  if (count > 1) return count;
  for (const child of container.querySelectorAll('*'))
    if (child.shadowRoot) {
      count += controlsWithin(child.shadowRoot);
      if (count > 1) break;
    }
  return count;
}
// Shared field-boundary checks for local presentation metadata such as units.
export { parentOf as composedParent, controlsWithin as fieldControlCount };

function clean(element: Element | null): string {
  if (!element) return '';
  const copy = element.cloneNode(true) as Element;
  copy
    .querySelectorAll(`${CONTROL_SELECTOR},button,[role="option"],script,style`)
    .forEach((node) => node.remove());
  return copy.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) || '';
}
export function ariaLabel(element: Element): string {
  return (element.getAttribute('aria-labelledby') || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => clean(reference(element, id)))
    .filter(Boolean)
    .join(' ');
}

/** Associated helper text (for example Google Forms sentence/word guidance). */
export function fieldInstructions(element: Element): string {
  return [
    ...new Set(
      (element.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => clean(reference(element, id)))
        .filter(Boolean),
    ),
  ]
    .join('\n')
    .slice(0, 1500);
}

function humanLabels(element: HTMLElement): string[] {
  const labels = [ariaLabel(element), element.getAttribute('aria-label') || ''];
  if ('labels' in element)
    labels.push(...[...((element as HTMLInputElement).labels || [])].map(clean));
  if (!labels.some((label) => !isGenericPrompt(label))) {
    let node: Element = element;
    // Labels may be siblings of an input wrapper (React Select, LinkedIn, ATSs).
    for (let depth = 0; depth < 9; depth++) {
      const sibling = node.previousElementSibling;
      if (
        sibling?.matches('label,[class*="label"],[class*="question"],legend') &&
        !sibling.querySelector(CONTROL_SELECTOR)
      )
        labels.push(clean(sibling));
      const parent = parentOf(node);
      if (!parent || parent.matches('form,body,main,section,html') || controlsWithin(parent) > 1)
        break;
      if (parent.matches(FIELD_CONTAINER)) {
        const label = parent.querySelector(
          'label,[class*="label"],[class*="question"],legend,[role="heading"],h2,h3',
        );
        if (label && !label.contains(element)) labels.push(clean(label));
      }
      if (labels.some((label) => !isGenericPrompt(label))) break;
      node = parent;
    }
  }
  labels.push(
    element.getAttribute('placeholder') || '',
    element.getAttribute('data-placeholder') || '',
  );
  return [...new Set(labels.filter((label) => !isGenericPrompt(label)))];
}

/** Only readable, non-placeholder questions are sent to an AI provider. */
export function fieldQuestion(element: HTMLElement): string {
  return humanLabels(element)[0] || '';
}

export function fieldLabels(element: HTMLElement): string[] {
  const human = humanLabels(element);
  const attributes = ['name', 'id', 'data-automation-id', 'data-testid'].map(
    (name) => element.getAttribute(name) || '',
  );
  return [...new Set([...human, ...attributes].filter(Boolean))];
}

export function autocompleteToken(element: Element): string | undefined {
  const tokens = (element.getAttribute('autocomplete') || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return tokens
    .filter(
      (token) =>
        !token.startsWith('section-') &&
        !['shipping', 'billing', 'home', 'work', 'mobile', 'fax', 'pager', 'webauthn'].includes(
          token,
        ),
    )
    .at(-1);
}

export function fieldContext(element: HTMLElement): string {
  let group: Element | null = element;
  while (group && !group.matches('fieldset,[role="group"],[role="radiogroup"]'))
    group = parentOf(group);
  if (!group) return '';
  return [
    ariaLabel(group),
    group.getAttribute('aria-label'),
    clean(group.querySelector(':scope > legend,:scope > h2,:scope > h3')),
  ]
    .filter(Boolean)
    .join(' ');
}
