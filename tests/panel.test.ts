// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CustomField, ProfileFields } from '../src/types';

const state = vi.hoisted(() => ({
  profile: { id: 'local', name: 'My profile', personal: {} },
  data: { fields: [], autoFill: false } as ProfileFields,
  builtIns: [] as CustomField[],
  save: vi.fn(),
  autoSave: vi.fn(),
  sendMessage: vi.fn(),
  copy: vi.fn(),
}));
vi.mock('../src/storage', () => ({
  getProfileContext: async () => state.profile,
  getCustomProfile: async () => structuredClone(state.data),
  getActiveFields: async () => ({
    ...state.data,
    fields: [
      ...state.builtIns
        .filter((f) => !state.data.hiddenBuiltIns?.includes(f.id))
        .map((field) => ({
          ...field,
          ...state.data.profileOverrides?.find((override) => override.id === field.id),
        })),
      ...state.data.fields,
    ],
  }),
  saveCustomProfile: async (data: ProfileFields, expectedProfileId?: string) => {
    state.save(data, expectedProfileId);
    state.data = structuredClone(data);
  },
  setAutoFillPreference: async (enabled: boolean, profileId: string) => {
    state.autoSave(enabled, profileId);
    state.data.autoFill = enabled;
  },
  parseImport: (text: string) => JSON.parse(text),
}));
import { copyValue, mountPanel } from '../src/panel';

const base: CustomField = {
  id: 'expected',
  label: 'Expected compensation',
  value: 'My preferred answer',
  aliases: ['expected salary'],
  exclude: ['current'],
  category: 'Compensation',
  enabled: true,
  matchMode: 'phrase',
  scope: '',
};
let unmount: (() => void) | undefined;
function control(label: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const node = [...document.querySelectorAll('label')]
    .find((item) => item.firstElementChild?.textContent === label)
    ?.querySelector('input,textarea,select');
  if (!node) throw new Error(`No control: ${label}`);
  return node as HTMLInputElement;
}
function click(label: string): void {
  const node = [...document.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === label || item.textContent === label,
  );
  if (!node) throw new Error(`No button: ${label}`);
  node.click();
}
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
function removeFromMenu(label: string, builtIn = true): void {
  click(`More options for ${label}`);
  click(`${builtIn ? 'Remove' : 'Delete'} ${label}`);
  click(`Confirm removal of ${label}`);
}
async function mount(): Promise<void> {
  const host = document.createElement('div');
  host.id = 'eze-custom-root';
  document.body.append(host);
  unmount = await mountPanel(host);
}
beforeEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
  state.profile = { id: 'local', name: 'My profile', personal: {} };
  state.data = { fields: [{ ...base }], autoFill: false };
  state.builtIns = [
    {
      ...base,
      id: 'builtin:first',
      label: 'First name',
      value: 'Alex',
      category: 'Contact',
      aliases: [],
      exclude: [],
    },
  ];
  state.save.mockClear();
  state.autoSave.mockClear();
  state.sendMessage.mockReset();
  state.copy.mockReset();
  state.copy.mockResolvedValue(undefined);
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: state.sendMessage },
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: state.copy },
    configurable: true,
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.unstubAllGlobals();
});

describe('custom field panel', () => {
  it('edits a profile shortcut in place, uses its edited answer for copying, and resets to the derived profile value', async () => {
    await mount();
    click('More options for First name');
    click('Edit First name');
    expect(control('Your answer').value).toBe('Alex');
    control('Your answer').value = 'Alexander';
    click('Save field');
    await settle();
    expect(state.data.profileOverrides?.[0]).toMatchObject({
      id: 'builtin:first',
      value: 'Alexander',
    });
    expect(state.data.fields).toEqual([base]);
    click('Copy First name');
    await settle();
    expect(state.copy).toHaveBeenCalledWith('Alexander');
    click('More options for First name');
    click('Reset First name to profile value');
    await settle();
    expect(state.data.profileOverrides).toEqual([]);
    click('Copy First name');
    await settle();
    expect(state.copy).toHaveBeenLastCalledWith('Alex');
  });
  it('can save an empty profile shortcut without creating a custom-field duplicate', async () => {
    await mount();
    click('More options for First name');
    click('Edit First name');
    control('Your answer').value = '';
    click('Save field');
    await settle();
    expect(state.data.profileOverrides?.[0].value).toBe('');
    expect(
      document.querySelector<HTMLButtonElement>('[aria-label="Copy First name"]')?.disabled,
    ).toBe(true);
    expect(state.data.fields).toHaveLength(1);
  });
  it('uses the shared profile toggle without rewriting the saved-answer list', async () => {
    await mount();
    const auto = document.querySelector<HTMLInputElement>(
      '[aria-label="Automatically fill custom fields"]',
    )!;
    auto.click();
    await settle();
    expect(state.autoSave).toHaveBeenCalledWith(true, 'local');
    expect(state.save).not.toHaveBeenCalled();
    expect(state.data.fields).toEqual([base]);
    expect(auto.checked).toBe(true);
  });
  it('keeps compact autofill controls above the answer list and moves Edit into the menu', async () => {
    await mount();
    const bar = document.querySelector('.eze-sticky')!;
    const list = document.querySelector('.eze-field-list')!;
    expect(bar.querySelector('[aria-label="Automatically fill custom fields"]')).not.toBeNull();
    expect(bar.querySelector('[aria-label="Fill this page"]')?.textContent).toBe('Fill this page');
    expect(bar.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('.eze-edit')).toBeNull();
    expect(document.querySelector('.eze-panel-options')).toBeNull();
    click('More options for Expected compensation');
    click('Edit Expected compensation');
    expect(control('Your answer').value).toBe(base.value);
  });
  it('keeps both hide arrows and dispatches the existing hide action from each', async () => {
    state.sendMessage.mockResolvedValue({
      error: 'Chrome version needs its built-in close button.',
    });
    await mount();
    const hide = document.querySelector<HTMLButtonElement>('.eze-hide-panel')!;
    const headerHide = document.querySelector<HTMLButtonElement>('.eze-header-hide')!;
    expect(hide.parentElement?.id).toBe('eze-custom-root');
    expect(document.querySelector('.eze-sticky')?.contains(hide)).toBe(false);
    expect(document.querySelector('.eze-header')?.contains(headerHide)).toBe(true);
    expect(hide.textContent).toBe('›');
    expect(headerHide.textContent).toBe('›');
    expect(
      document.querySelector('.eze-sticky [aria-label="Collapse your fields"]'),
    ).not.toBeNull();
    hide.click();
    await settle();
    expect(state.sendMessage).toHaveBeenCalledWith({ type: 'eze-custom:hide-panel' });
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'built-in close button',
    );
    headerHide.click();
    await settle();
    expect(state.sendMessage).toHaveBeenCalledTimes(2);
    expect(state.sendMessage).toHaveBeenLastCalledWith({ type: 'eze-custom:hide-panel' });
  });
  it('prevents a second hide request while the first arrow is still working', async () => {
    let finish!: (result: { error: string }) => void;
    state.sendMessage.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await mount();
    const edge = document.querySelector<HTMLButtonElement>('.eze-hide-panel')!;
    const header = document.querySelector<HTMLButtonElement>('.eze-header-hide')!;
    edge.click();
    expect(edge.disabled).toBe(true);
    expect(header.disabled).toBe(true);
    header.click();
    expect(state.sendMessage).toHaveBeenCalledTimes(1);
    finish({ error: 'Try again' });
    await settle();
    expect(edge.disabled).toBe(false);
    expect(header.disabled).toBe(false);
  });
  it('places the hide arrow at the inner edge when Chrome uses a left side panel', async () => {
    const getLayout = vi.fn().mockResolvedValue({ side: 'left' });
    Object.assign(chrome, { sidePanel: { getLayout } });
    await mount();
    await settle();
    const hide = document.querySelector<HTMLButtonElement>(
      '[aria-label="Hide EZEapply side panel"]',
    )!;
    expect(hide.classList.contains('eze-panel-left')).toBe(true);
    expect(hide.textContent).toBe('‹');
    expect(document.querySelector('.eze-header-hide')?.textContent).toBe('‹');
    getLayout.mockResolvedValue({ side: 'right' });
    window.dispatchEvent(new Event('focus'));
    await settle();
    expect(hide.classList.contains('eze-panel-left')).toBe(false);
    expect(hide.textContent).toBe('›');
    expect(document.querySelector('.eze-header-hide')?.textContent).toBe('›');
  });
  it('keeps the hide arrow vertically centered when the sidebar zoom changes', async () => {
    await mount();
    const hide = document.querySelector<HTMLButtonElement>(
      '[aria-label="Hide EZEapply side panel"]',
    )!;
    expect(Number.parseFloat(hide.style.top)).toBe(window.innerHeight / 2);
    click('Zoom out sidebar');
    await settle();
    expect(Number.parseFloat(hide.style.top) * 0.9).toBeCloseTo(window.innerHeight / 2);
  });
  it('copies the exact saved answer with one click and offers no editor for derived fields', async () => {
    await mount();
    click('Copy Expected compensation');
    await settle();
    expect(state.copy).toHaveBeenCalledWith('My preferred answer');
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      'Expected compensation copied',
    );
    expect(document.querySelector('[aria-label="Edit First name"]')).toBeNull();
    click('Copy First name');
    await settle();
    expect(state.copy).toHaveBeenCalledWith('Alex');
    const copy = document.querySelector('[aria-label="Copy First name"]')!;
    expect(copy.querySelector('.eze-field-label')).toBeNull();
    expect(copy.previousElementSibling?.textContent).toBe('First name');
  });
  it('removes profile shortcuts persistently and can restore them after reopening the panel', async () => {
    await mount();
    removeFromMenu('First name');
    await settle();
    expect(state.data.hiddenBuiltIns).toEqual(['builtin:first']);
    expect(state.data.fields).toHaveLength(1);
    expect(document.querySelector('[aria-label="Copy First name"]')).toBeNull();
    expect(state.save.mock.calls[0][1]).toBe('local');
    unmount?.();
    document.body.replaceChildren();
    await mount();
    expect(document.querySelector('[aria-label="Copy First name"]')).toBeNull();
    click('Restore hidden profile fields (1)');
    await settle();
    expect(document.querySelector('[aria-label="Copy First name"]')).not.toBeNull();
    expect(state.data.hiddenBuiltIns).toEqual([]);
  });
  it('requires menu and explicit confirmation, then offers undo that preserves newer fields', async () => {
    await mount();
    expect(document.querySelector('[aria-label="Delete Expected compensation"]')).toBeNull();
    click('More options for Expected compensation');
    click('Delete Expected compensation');
    expect(state.save).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toBe('Cancel');
    click('Confirm removal of Expected compensation');
    await settle();
    expect(state.data.fields).toEqual([]);
    expect(document.querySelector('[aria-label="Copy Expected compensation"]')).toBeNull();
    state.data.fields.push({ ...base, id: 'newer', label: 'New answer' });
    click('Undo removal');
    await settle();
    expect(state.data.fields.map((f) => f.id)).toEqual(['expected', 'newer']);
  });
  it('does not restore removed fields into a different profile', async () => {
    await mount();
    removeFromMenu('First name');
    await settle();
    state.profile.id = 'another-profile';
    state.save.mockClear();
    click('Undo removal');
    await settle();
    expect(state.save).not.toHaveBeenCalled();
    expect(document.querySelector('[role="status"]')?.textContent).toContain('profile changed');
  });
  it('cancels removal without changing data and blocks confirmation after a profile switch', async () => {
    await mount();
    click('More options for First name');
    click('Remove First name');
    click('Cancel');
    expect(state.save).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-label="Copy First name"]')).not.toBeNull();
    click('More options for First name');
    click('Remove First name');
    state.profile.id = 'other';
    click('Confirm removal of First name');
    await settle();
    expect(state.save).not.toHaveBeenCalled();
    expect(document.querySelector('[role="status"]')?.textContent).toContain('profile changed');
  });
  it('supports keyboard reordering and retains the order after reopening', async () => {
    state.builtIns.push(
      { ...state.builtIns[0], id: 'builtin:middle', label: 'Middle name', value: '' },
      { ...state.builtIns[0], id: 'builtin:last', label: 'Last name', value: 'Sharma' },
    );
    await mount();
    document
      .querySelector('[aria-label="Reorder Last name"]')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
      );
    await settle();
    expect(state.data.fieldOrder?.filter((id) => id.startsWith('builtin:'))).toEqual([
      'builtin:first',
      'builtin:last',
      'builtin:middle',
    ]);
    expect(state.copy).not.toHaveBeenCalled();
    unmount?.();
    document.body.replaceChildren();
    await mount();
    expect(
      [...document.querySelectorAll('[data-field-id]')]
        .map((node) => (node as HTMLElement).dataset.fieldId)
        .filter((id) => id?.startsWith('builtin:')),
    ).toEqual(['builtin:first', 'builtin:last', 'builtin:middle']);
  });
  it('persists a handle drag drop without copying or removing the answer', async () => {
    state.builtIns.push(
      { ...state.builtIns[0], id: 'builtin:middle', label: 'Middle name', value: '' },
      { ...state.builtIns[0], id: 'builtin:last', label: 'Last name', value: 'Sharma' },
    );
    await mount();
    const dispatch = (node: EventTarget, type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        button: { value: 0 },
        isPrimary: { value: true },
        clientX: { value: x },
        clientY: { value: y },
      });
      node.dispatchEvent(event);
    };
    const target = document.querySelector('[data-field-id="builtin:first"]')!;
    const hitTest = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => target,
    });
    dispatch(document.querySelector('[aria-label="Reorder Last name"]')!, 'pointerdown', 10, 90);
    dispatch(document, 'pointermove', 10, 1);
    expect(target.classList.contains('eze-drop-after')).toBe(true);
    dispatch(document, 'pointerup', 10, 1);
    await settle();
    if (hitTest) Object.defineProperty(document, 'elementFromPoint', hitTest);
    else delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    expect(state.data.fieldOrder?.filter((id) => id.startsWith('builtin:'))).toEqual([
      'builtin:first',
      'builtin:last',
      'builtin:middle',
    ]);
    expect(state.data.fields).toHaveLength(1);
    expect(state.data.hiddenBuiltIns).toBeUndefined();
    expect(state.copy).not.toHaveBeenCalled();
  });
  it('provides menu-based movement without affecting another section', async () => {
    state.data.fields.push({ ...base, id: 'current', label: 'Current compensation' });
    await mount();
    click('More options for Current compensation');
    click('Move Current compensation up');
    await settle();
    const labels = [...document.querySelectorAll('.eze-field-label')].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(['First name', 'Current compensation', 'Expected compensation']);
    expect(state.data.fields.map((field) => field.id)).toEqual(['expected', 'current']);
  });
  it('creates a custom answer with matching exclusions and no example compensation value', async () => {
    state.data.fields = [];
    await mount();
    click('+ Add field');
    const template = control('Quick start');
    template.value = 'Expected compensation';
    template.dispatchEvent(new Event('change'));
    expect(control('Field name').value).toBe('Expected compensation');
    expect(control('Your answer').value).toBe('');
    control('Your answer').value = '1200000';
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(state.save).toHaveBeenCalledOnce();
    expect(state.save.mock.calls[0][1]).toBe('local');
    expect(state.data.fields[0]).toMatchObject({
      label: 'Expected compensation',
      value: '1200000',
      exclude: ['current', 'previous', 'last drawn'],
      enabled: true,
    });
    expect(document.querySelector('dialog')).toBeNull();
  });
  it('filters by aliases, retaining stored values as text', async () => {
    state.data.fields[0].value = '<img src=x onerror=alert(1)>';
    await mount();
    expect(document.querySelector('img')).toBeNull();
    const search = document.querySelector<HTMLInputElement>('[aria-label="Search your fields"]')!;
    search.value = 'expected salary';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('.eze-field-row')).toHaveLength(1);
    expect(document.querySelector('.eze-field-value')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });
  it('does not save an editor into another profile after a profile switch', async () => {
    await mount();
    click('More options for Expected compensation');
    click('Edit Expected compensation');
    state.profile.id = 'other';
    control('Your answer').value = 'Updated';
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(state.save).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]:not([hidden])')?.textContent).toContain(
      'profile changed',
    );
  });
  it('discovers unanswered questions and opens a prefilled answer editor', async () => {
    state.sendMessage.mockResolvedValue({
      filled: 0,
      skipped: 1,
      questions: [{ id: '1', label: 'What is your notice period?', kind: 'text', filled: false }],
    });
    await mount();
    click('Find questions');
    await settle();
    expect(state.sendMessage).toHaveBeenCalledWith({ type: 'eze-custom:dispatch', action: 'scan' });
    click('Save answer for What is your notice period?');
    expect(control('Field name').value).toBe('What is your notice period?');
    expect(control('Your answer').value).toBe('');
  });
  it('offers a distinct Draft with AI action and passes its original tab/frame reference', async () => {
    const label = 'Describe the best AI agent you built';
    state.sendMessage
      .mockResolvedValueOnce({
        tabId: 3,
        filled: 0,
        skipped: 2,
        questions: [
          {
            id: '2:question-4',
            documentId: 'document-a',
            label,
            kind: 'input',
            filled: false,
            canDraftWithAI: true,
          },
          { id: '2:question-5', label: 'College name', kind: 'input', filled: false },
        ],
      })
      .mockResolvedValue({ ok: true });
    await mount();
    click('Find questions');
    await settle();
    expect(document.querySelectorAll('.eze-ai-draft')).toHaveLength(1);
    click(`Draft AI answer for ${label}`);
    await settle();
    expect(state.sendMessage).toHaveBeenLastCalledWith({
      type: 'eze-custom:open-ai',
      tabId: 3,
      questionId: '2:question-4',
      questionLabel: label,
      documentId: 'document-a',
    });
    expect(document.querySelector('[role="status"]')?.textContent).toContain('AI draft opened');
    expect(
      state.sendMessage.mock.calls.some(([message]) => message.type === 'eze-ai:generate'),
    ).toBe(false);
  });
  it('requires deliberate deletion and reports failed page connection', async () => {
    await mount();
    click('More options for Expected compensation');
    click('Edit Expected compensation');
    click('Delete');
    expect(state.save).not.toHaveBeenCalled();
    click('Confirm removal of Expected compensation');
    await settle();
    expect(state.data.fields).toHaveLength(0);
    state.sendMessage.mockResolvedValue(undefined);
    click('Fill this page');
    await settle();
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'Refresh the application tab',
    );
  });
  it('rejects website paths rather than silently broadening the rule', async () => {
    await mount();
    click('More options for Expected compensation');
    click('Edit Expected compensation');
    control('Limit to a website').value = 'linkedin.com/jobs';
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(state.save).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]:not([hidden])')?.textContent).toContain(
      'hostname',
    );
  });
  it('shows the specific background error when there is no report payload', async () => {
    state.sendMessage.mockResolvedValue({ error: 'Chrome does not allow access to this page.' });
    await mount();
    click('Fill this page');
    await settle();
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      'Chrome does not allow access to this page.',
    );
  });
  it('keeps matched but unfilled questions visible with copy and editing actions', async () => {
    state.sendMessage.mockResolvedValue({
      filled: 0,
      skipped: 1,
      questions: [
        {
          id: 'salary',
          label: 'Expected salary',
          kind: 'number',
          filled: false,
          matchedField: 'expected',
          reason: 'This input requires a numeric answer.',
        },
      ],
    });
    await mount();
    click('Fill this page');
    await settle();
    expect(document.querySelector('.eze-questions')?.textContent).toContain(
      'This input requires a numeric answer.',
    );
    click('Copy saved answer for Expected salary');
    await settle();
    expect(state.copy).toHaveBeenCalledWith(base.value);
    click('Edit matching field for Expected salary');
    expect(control('Field name').value).toBe('Expected compensation');
    expect(control('Your answer').value).toBe(base.value);
  });
  it('describes undo without an incorrect no-form message', async () => {
    state.sendMessage.mockResolvedValue({ filled: 2, skipped: 0, questions: [] });
    await mount();
    click('Undo');
    await settle();
    expect(document.querySelector('.eze-report')?.textContent).toContain('Restored 2 fields');
    expect(document.querySelector('.eze-report')?.textContent).not.toContain('No supported form');
  });
  it('surfaces clipboard denial when the fallback also fails', async () => {
    state.copy.mockRejectedValue(new Error('denied'));
    await expect(copyValue('test')).rejects.toThrow('Clipboard access was denied');
    expect(document.body.querySelector('textarea')).toBeNull();
  });
});
