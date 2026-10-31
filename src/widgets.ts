import { normalize } from './matcher';
import { isDropdownPlaceholder, normalizeOption } from './dropdown';

export interface WidgetResult {
  filled: boolean;
  reason: string;
}
function clean(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}
function parent(element: Element): Element | null {
  return element.parentElement || (element.getRootNode() as ShadowRoot).host || null;
}
function visible(element: Element): boolean {
  if (!element.isConnected) return false;
  for (let node: Element | null = element; node; node = parent(node)) {
    if (
      node.hasAttribute('hidden') ||
      node.hasAttribute('inert') ||
      node.getAttribute('aria-hidden') === 'true'
    )
      return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  }
  return true;
}
function inputOf(element: HTMLElement): HTMLInputElement | null {
  return element.tagName === 'INPUT'
    ? (element as HTMLInputElement)
    : element.querySelector<HTMLInputElement>('input:not([type="hidden"])');
}
function backingSelect(element: HTMLElement): HTMLSelectElement | null {
  const contained = element.querySelector<HTMLSelectElement>('select');
  if (contained) return contained;
  // Some ATS widgets render a labelled hidden select immediately before their
  // trigger. Require the same accessible label to avoid borrowing another field.
  const sibling = element.previousElementSibling;
  const label = normalize(element.getAttribute('aria-label') || '');
  return sibling?.tagName === 'SELECT' &&
    !visible(sibling) &&
    label &&
    normalize(sibling.getAttribute('aria-label') || '') === label
    ? (sibling as HTMLSelectElement)
    : null;
}
function committedValue(element: HTMLElement): string {
  const select = backingSelect(element);
  if (select) {
    const option = select.selectedOptions[0];
    if (option?.value && !option.disabled && !isDropdownPlaceholder(option.textContent))
      return clean(option.textContent) || option.value;
    return '';
  }
  const ariaValue = clean(element.getAttribute('aria-valuetext'));
  if (ariaValue && !isDropdownPlaceholder(ariaValue)) return ariaValue;
  // Search text and the highlighted listbox option are not committed values.
  // Choices and React Select render a separate selected item when accepted.
  const scope = element.closest('[class*="-control"],[class*="__control"]') || element;
  const selected = scope.querySelector(
    '[class*="singleValue"],[class*="single-value"],[class*="__single-value"],.choices__list--single [data-item]',
  );
  return selected &&
    visible(selected) &&
    !selected.closest('[role="listbox"]') &&
    !isDropdownPlaceholder(selected.textContent)
    ? clean(selected.textContent)
    : '';
}
function rootsOf(element: Element): (Document | ShadowRoot)[] {
  const root = element.getRootNode() as Document | ShadowRoot;
  return root === element.ownerDocument ? [root] : [root, element.ownerDocument];
}
function popupNodes(element: HTMLElement): Element[] {
  const input = inputOf(element);
  const controls = [element, input].filter((node): node is HTMLElement => !!node);
  const ids = [
    ...new Set(
      controls
        .flatMap((node) => [node.getAttribute('aria-controls'), node.getAttribute('aria-owns')])
        .flatMap((value) => (value || '').split(/\s+/).filter(Boolean)),
    ),
  ];
  const nodes: Element[] = [];
  for (const id of ids)
    for (const root of rootsOf(element)) {
      const node = root.getElementById(id);
      if (
        node &&
        (node.matches('[role="listbox"]') || node.querySelector('[role="option"]')) &&
        visible(node)
      )
        nodes.push(node);
    }
  for (const control of controls) {
    const activeId = control.getAttribute('aria-activedescendant');
    if (!activeId) continue;
    for (const root of rootsOf(element)) {
      const option = root.getElementById(activeId);
      const list = option?.matches('[role="option"]') ? option.closest('[role="listbox"]') : null;
      if (list && visible(list)) nodes.push(list);
    }
  }
  // A popup may be the trigger's adjacent sibling rather than its descendant.
  // Follow that container's explicit ARIA ownership only to a contained listbox;
  // never search arbitrary siblings, other questions or the page's global menus.
  for (const sibling of [element.previousElementSibling, element.nextElementSibling]) {
    if (!sibling?.hasAttribute('aria-expanded') || sibling.querySelector('label')) continue;
    for (const id of (sibling.getAttribute('aria-owns') || '').split(/\s+/).filter(Boolean)) {
      const list = sibling.getRootNode() as Document | ShadowRoot;
      const node = list.getElementById(id);
      if (node?.matches('[role="listbox"]') && sibling.contains(node) && visible(node))
        nodes.push(node);
    }
  }
  // A contained listbox has an explicit structural relationship; unrelated page
  // listboxes never participate in selection.
  for (const node of element.querySelectorAll('[role="listbox"]'))
    if (visible(node)) nodes.push(node);
  return [...new Set(nodes)];
}

/** An input's current text is preserved even if it is only an unfinished search. */
export function comboboxValue(element: HTMLElement): string {
  const input = inputOf(element);
  if (input?.value.trim()) return input.value.trim();
  const committed = committedValue(element);
  if (committed) return committed;
  if (input) return '';
  const clone = element.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('[role="listbox"],[role="option"],svg,[aria-hidden="true"]')
    .forEach((node) => node.remove());
  const value = clean(clone.textContent);
  const placeholder = clean(
    element.getAttribute('data-placeholder') || element.getAttribute('aria-placeholder'),
  );
  return value === placeholder || isDropdownPlaceholder(value) ? '' : value;
}
function setInput(input: HTMLInputElement, value: string): void {
  const win = input.ownerDocument.defaultView!;
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  // Some searchable selects filter on keyup instead of input. Dispatching both
  // runs their own search handlers without writing the backing select value.
  input.dispatchEvent(
    new win.KeyboardEvent('keyup', {
      key: value.at(-1) || 'Backspace',
      bubbles: true,
      composed: true,
    }),
  );
}
function activate(element: HTMLElement): void {
  const win = element.ownerDocument.defaultView!;
  if (typeof win.PointerEvent === 'function')
    element.dispatchEvent(
      new win.PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
  if (!element.isConnected) return;
  element.dispatchEvent(
    new win.MouseEvent('mousedown', {
      button: 0,
      buttons: 1,
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  );
  if (!element.isConnected) return;
  if (typeof win.PointerEvent === 'function')
    element.dispatchEvent(
      new win.PointerEvent('pointerup', {
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 0,
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
  element.dispatchEvent(
    new win.MouseEvent('mouseup', {
      button: 0,
      buttons: 0,
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  );
  if (element.isConnected) element.click();
}
function wait(document: Document, milliseconds: number): Promise<void> {
  return new Promise((resolve) => document.defaultView!.setTimeout(resolve, milliseconds));
}
function answersMatch(value: string, answers: Set<string>): boolean {
  return answers.has(normalizeOption(value));
}
function optionValues(option: Element): string[] {
  return [
    clean(option.textContent),
    clean(option.getAttribute('aria-label')),
    clean(option.getAttribute('data-value')),
  ].filter(Boolean);
}

/** Clicking a real option invokes the widget's own selection handlers;
 * injecting text alone is never success. Callers throttle failed automatic
 * attempts and preserve controls the user is actively editing. */
export async function fillCombobox(
  element: HTMLElement,
  answer: string,
  valueAliases: string[] = [],
  signal?: AbortSignal,
): Promise<WidgetResult> {
  const fail = (reason: string): WidgetResult => ({ filled: false, reason });
  if (signal?.aborted) return fail('Automatic filling was stopped');
  if (!answer.trim()) return fail('Saved answer is empty');
  if (
    !visible(element) ||
    element.getAttribute('aria-disabled') === 'true' ||
    element.hasAttribute('disabled')
  )
    return fail('Dropdown is not available');
  if (element.tagName === 'SELECT') return fail('Use the native dropdown adapter');
  if (
    element.closest('[aria-multiselectable="true"]') ||
    element.getAttribute('aria-multiselectable') === 'true' ||
    element.getAttribute('data-type') === 'select-multiple' ||
    backingSelect(element)?.multiple
  )
    return fail('Multiple-choice dropdown requires manual selection');
  const input = inputOf(element);
  if (
    input &&
    (input.disabled ||
      ['password', 'file', 'checkbox', 'radio', 'submit', 'hidden'].includes(input.type))
  )
    return fail('Dropdown input is not editable');
  if (comboboxValue(element)) return fail('Existing dropdown answer preserved');
  if (
    element.tagName === 'BUTTON' &&
    (element as HTMLButtonElement).form &&
    (element as HTMLButtonElement).type !== 'button'
  )
    return fail('Dropdown trigger could submit the form; select it manually');
  const answers = new Set([answer, ...valueAliases].map(normalizeOption).filter(Boolean));
  const original = input?.value || '';
  let typed = false;
  let userChanged = false;
  let selected: HTMLElement | undefined;
  const onUserChange = (event: Event) => {
    if (event.isTrusted) userChanged = true;
  };
  element.addEventListener('input', onUserChange, true);
  element.addEventListener('change', onUserChange, true);
  function rollback(): void {
    if (input && typed && !userChanged && input.value === answer) setInput(input, original);
    element.dispatchEvent(
      new element.ownerDocument.defaultView!.KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
      }),
    );
  }
  try {
    element.focus();
    activate(element);
    // Allow synchronous focus/click handlers to populate options before filtering.
    for (let attempt = 0; attempt < 40; attempt++) {
      if (signal?.aborted) {
        rollback();
        return fail('Automatic filling was stopped');
      }
      if (userChanged) return fail('Your dropdown edit was preserved');
      if (!element.isConnected) return fail('Dropdown changed while opening; try again');
      const current = comboboxValue(element);
      if (current && !(typed && input?.value === answer && current === answer))
        return fail('A new dropdown answer appeared while opening; preserved it');
      const popups = popupNodes(element);
      if (popups.some((popup) => popup.getAttribute('aria-multiselectable') === 'true')) {
        rollback();
        return fail('Multiple-choice dropdown requires manual selection');
      }
      const options = [
        ...new Set(
          popups.flatMap((popup) => [...popup.querySelectorAll<HTMLElement>('[role="option"]')]),
        ),
      ].filter(
        (option) =>
          visible(option) &&
          !isDropdownPlaceholder(option.getAttribute('aria-label') || option.textContent) &&
          option.getAttribute('aria-disabled') !== 'true' &&
          !option.hasAttribute('disabled'),
      );
      const matches = options.filter((option) =>
        optionValues(option).some((value) => answersMatch(value, answers)),
      );
      if (matches.length > 1) {
        rollback();
        return fail('More than one dropdown option matches; choose manually');
      }
      if (matches.length === 1) {
        selected = matches[0];
        break;
      }
      if (attempt === 1 && input && !input.readOnly && visible(input)) {
        typed = true;
        setInput(input, answer);
      }
      await wait(element.ownerDocument, 50);
    }
    if (!selected) {
      rollback();
      return fail('No matching option in the dropdown; choose manually');
    }
    if (signal?.aborted) {
      rollback();
      return fail('Automatic filling was stopped');
    }
    if (
      selected.closest('a[href]') ||
      (selected.tagName === 'BUTTON' &&
        (selected as HTMLButtonElement).form &&
        (selected as HTMLButtonElement).type !== 'button') ||
      (selected.tagName === 'INPUT' &&
        ['submit', 'image'].includes((selected as HTMLInputElement).type))
    ) {
      rollback();
      return fail('Dropdown option could submit or navigate the page; select it manually');
    }
    const beforeClick = comboboxValue(element);
    const wasSelected = selected.getAttribute('aria-selected') === 'true';
    const wasExpanded =
      element.getAttribute('aria-expanded') === 'true' ||
      input?.getAttribute('aria-expanded') === 'true';
    activate(selected);
    for (let attempt = 0; attempt < 6; attempt++) {
      await wait(element.ownerDocument, 40);
      if (userChanged) return fail('Your dropdown edit was preserved');
      if (!element.isConnected)
        return fail('Dropdown changed during selection; review the current step');
      const value = comboboxValue(element);
      const selectedState = !wasSelected && selected.getAttribute('aria-selected') === 'true';
      const collapsed =
        wasExpanded &&
        (element.getAttribute('aria-expanded') === 'false' ||
          input?.getAttribute('aria-expanded') === 'false');
      const acceptedText = answersMatch(value, answers) && (value !== beforeClick || collapsed);
      const committed = answersMatch(committedValue(element), answers);
      // Choices uses aria-selected for keyboard highlight before selection.
      // Widgets with a backing select must confirm its committed value/label.
      if (committed || (!backingSelect(element) && (selectedState || acceptedText)))
        return {
          filled: true,
          reason: 'Selected the matching dropdown option; review before submitting',
        };
    }
    rollback();
    return fail('The dropdown did not confirm the selected option; review manually');
  } catch {
    rollback();
    return fail('This dropdown needs manual selection');
  } finally {
    element.removeEventListener('input', onUserChange, true);
    element.removeEventListener('change', onUserChange, true);
  }
}
