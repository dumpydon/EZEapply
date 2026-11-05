import { CONTROL_SELECTOR, composedParent } from './form-labels';

const RADIO = 'input[type="radio"],[role="radio"]';
const BOUNDARY = 'form,body,html,main,section,dialog,[role="dialog"],[role="form"]';

function nativeRadio(element: Element): element is HTMLInputElement {
  return element.tagName === 'INPUT' && (element as HTMLInputElement).type === 'radio';
}
function logicalRadios(scope: Element): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(RADIO)].filter(
    (element) =>
      nativeRadio(element) ||
      (!element.querySelector('input[type="radio"]') &&
        !element.parentElement?.closest('[role="radio"]')),
  );
}
function sameGroup(first: HTMLElement, other: HTMLElement): boolean {
  if (nativeRadio(first) && nativeRadio(other)) {
    if (first.name || other.name)
      return !!first.name && first.name === other.name && first.form === other.form;
    const group = first.closest('fieldset,[role="radiogroup"]');
    return !!group && group === other.closest('fieldset,[role="radiogroup"]');
  }
  return (
    !nativeRadio(first) &&
    !nativeRadio(other) &&
    !!first.closest('[role="radiogroup"]') &&
    first.closest('[role="radiogroup"]') === other.closest('[role="radiogroup"]')
  );
}
function hasOtherControls(scope: Element): boolean {
  return [...scope.querySelectorAll(CONTROL_SELECTOR)].some(
    (element) =>
      !nativeRadio(element) &&
      element.getAttribute('role') !== 'radio' &&
      element.getAttribute('type') !== 'hidden',
  );
}

/** Text belonging to one visual choice, excluding icons, controls and hidden text. */
function readableText(scope: Element, visible: (element: Element) => boolean): string {
  const walker = scope.ownerDocument.createTreeWalker(scope, 4);
  let node: Node | null;
  const pieces: string[] = [];
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (
      !parent ||
      parent.closest(
        'svg,script,style,template,input,textarea,select,[hidden],[aria-hidden="true"]',
      ) ||
      !visible(parent)
    )
      continue;
    pieces.push(node.textContent || '');
    if (pieces.join(' ').length > 500) return '';
  }
  return pieces.join(' ').replace(/\s+/g, ' ').trim();
}

/** Modern forms often render an input, an icon and a plain span instead of a
 * label. Walk only through wrappers owning exactly this one logical choice. */
export function radioOptionContext(
  control: HTMLElement,
  visible: (element: Element) => boolean,
): { element: HTMLElement; label: string } | undefined {
  for (
    let node = composedParent(control), depth = 0;
    node && depth < 6 && !node.matches(BOUNDARY);
    node = composedParent(node), depth++
  ) {
    const radios = logicalRadios(node);
    if (radios.length !== 1 || radios[0] !== control || hasOtherControls(node)) break;
    const label = readableText(node, visible);
    if (label && visible(node)) return { element: node as HTMLElement, label };
  }
}

/** Find a readable question without borrowing text from another question or
 * the form. All controls in the inspected container must belong to this group. */
export function radioQuestionContext(
  control: HTMLElement,
  visible: (element: Element) => boolean,
): string {
  for (
    let node = composedParent(control), depth = 0;
    node && depth < 9 && !node.matches(BOUNDARY);
    node = composedParent(node), depth++
  ) {
    const radios = logicalRadios(node);
    if (hasOtherControls(node) || radios.some((other) => !sameGroup(control, other))) break;
    if (radios.length < 2) continue;
    const options = radios.map((radio) => radioOptionContext(radio, visible)?.element);
    const walker = node.ownerDocument.createTreeWalker(node, 1);
    let candidate: Node | null;
    while ((candidate = walker.nextNode())) {
      const element = candidate as Element;
      if (element.matches(RADIO) || element.querySelector(RADIO)) continue;
      // A choice's own text is not the question title.
      const option = options.some((option) => option?.contains(element));
      if (option) continue;
      const label = readableText(element, visible);
      if (label && !/^(?:yes|no)[\s.*:]*$/i.test(label)) return label;
    }
  }
  return '';
}
