// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountAIFieldUI } from '../src/ai/field-ui';

const dialogMethods = ['showModal', 'close'] as const;
const originalMethods = dialogMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  dialogMethods.forEach((name, index) => {
    const descriptor = originalMethods[index];
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
});

describe('AI draft entry points', () => {
  it('opens a review dialog from an eligible application panel action without generating', async () => {
    document.body.innerHTML = '<input aria-label="Describe your project">';
    const element = document.querySelector('input')!;
    const field = {
      element,
      question: 'Describe your project',
      value: '',
      maxLength: 300,
      instructions: 'Maximum 40 words.',
    };
    const sendMessage = vi.fn().mockResolvedValue({ configured: false, hasBackground: false });
    vi.stubGlobal('chrome', {
      runtime: { sendMessage, getURL: (path: string) => `chrome-extension://test/${path}` },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
    const attach = Element.prototype.attachShadow;
    let shadow: ShadowRoot | undefined;
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
      this: Element,
      init: ShadowRootInit,
    ) {
      shadow = attach.call(this, init);
      return shadow;
    });
    const ui = mountAIFieldUI({ fields: () => [field], enabled: () => true, apply: vi.fn() });
    try {
      expect(await ui.open(document.createElement('input'))).toBe(false);
      expect(await ui.open(element)).toBe(true);
      expect(shadow!.querySelector('dialog[open]')?.textContent).toContain('Describe your project');
      expect(shadow!.querySelector('dialog[open]')?.textContent).toContain('Maximum 40 words.');
      expect(shadow!.querySelector<HTMLImageElement>('.pill img')?.src).toBe(
        'chrome-extension://test/custom/ai-logo.png',
      );
      expect(shadow!.querySelector('.pill')?.textContent).toBe('EZE AI');
      expect(shadow!.querySelector('dialog[open]')?.textContent).toContain('Use saved résumé');
      expect(shadow!.querySelector<HTMLDetailsElement>('.extra')?.open).toBe(false);
      expect(
        [...shadow!.querySelectorAll('button')].find((button) => button.textContent === 'Generate')
          ?.disabled,
      ).toBe(true);
      expect(shadow!.activeElement?.textContent).toBe('AI settings');
      expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual(['eze-ai:status']);
      await expect(ui.open(element)).rejects.toThrow('already open');
      expect(element.value).toBe('');
    } finally {
      ui.dispose();
    }
    expect(await ui.open(element)).toBe(false);
    expect(document.querySelector('ezeapply-ai')).toBeNull();
  });
  it('does not open inline or panel AI on a disabled page, even with a stale field reference', async () => {
    document.body.innerHTML = '<textarea aria-label="Message body"></textarea>';
    const element = document.querySelector('textarea')!;
    const fields = vi.fn(() => [{ element, question: 'Message body', value: '', maxLength: 0 }]);
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const ui = mountAIFieldUI({ fields, enabled: () => false, apply: vi.fn() });
    try {
      element.focus();
      expect(await ui.open(element)).toBe(false);
      expect(fields).not.toHaveBeenCalled();
      expect(sendMessage).not.toHaveBeenCalled();
    } finally {
      ui.dispose();
    }
  });
  it('removes the inline button when the focused field loses application eligibility', async () => {
    vi.useFakeTimers();
    document.body.innerHTML =
      '<textarea aria-label="Describe your project"></textarea><input aria-label="Search">';
    const element = document.querySelector('textarea')!;
    const field = { element, question: 'Describe your project', value: '', maxLength: 0 };
    let fields = [field],
      enabled = true;
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 10,
      bottom: 110,
      width: 300,
      height: 100,
    } as DOMRect);
    const attach = Element.prototype.attachShadow;
    let shadow: ShadowRoot | undefined;
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
      this: Element,
      init: ShadowRootInit,
    ) {
      shadow = attach.call(this, init);
      return shadow;
    });
    const ui = mountAIFieldUI({ fields: () => fields, enabled: () => enabled, apply: vi.fn() });
    try {
      element.focus();
      expect(shadow!.querySelector<HTMLButtonElement>('.pill')?.hidden).toBe(false);
      fields = [];
      await vi.advanceTimersByTimeAsync(1000);
      expect(shadow!.querySelector<HTMLButtonElement>('.pill')?.hidden).toBe(true);
      fields = [field];
      element.blur();
      element.focus();
      expect(shadow!.querySelector<HTMLButtonElement>('.pill')?.hidden).toBe(false);
      enabled = false;
      document.querySelector('input')!.focus();
      expect(shadow!.querySelector<HTMLButtonElement>('.pill')?.hidden).toBe(true);
    } finally {
      ui.dispose();
    }
  });
  it('closes an open draft when navigation removes the application context', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<textarea aria-label="Describe your project"></textarea>';
    const element = document.querySelector('textarea')!;
    let fields = [{ element, question: 'Describe your project', value: '', maxLength: 0 }];
    const sendMessage = vi.fn().mockResolvedValue({
      configured: true,
      provider: 'preview',
      model: 'synthetic',
      hasBackground: true,
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
    const attach = Element.prototype.attachShadow;
    let shadow: ShadowRoot | undefined;
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
      this: Element,
      init: ShadowRootInit,
    ) {
      shadow = attach.call(this, init);
      return shadow;
    });
    const ui = mountAIFieldUI({ fields: () => fields, enabled: () => true, apply: vi.fn() });
    try {
      expect(await ui.open(element)).toBe(true);
      fields = [];
      await vi.advanceTimersByTimeAsync(1000);
      expect(shadow!.querySelector('dialog')).toBeNull();
      expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual(['eze-ai:status']);
      expect(element.value).toBe('');
    } finally {
      ui.dispose();
    }
  });
  it('shows saved background as ready, focuses Generate and refreshes provider setup when settings change', async () => {
    document.body.innerHTML = '<textarea aria-label="Describe your project"></textarea>';
    const element = document.querySelector('textarea')!;
    const sendMessage = vi.fn().mockResolvedValue({
      configured: true,
      provider: 'openai',
      model: 'example-model',
      hasBackground: true,
      backgroundCharacters: 1200,
      includeProfile: true,
    });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
    const attach = Element.prototype.attachShadow;
    let shadow: ShadowRoot | undefined;
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (
      this: Element,
      init: ShadowRootInit,
    ) {
      shadow = attach.call(this, init);
      return shadow;
    });
    const ui = mountAIFieldUI({
      fields: () => [{ element, question: 'Describe your project', value: '', maxLength: 0 }],
      enabled: () => true,
      apply: vi.fn(),
    });
    try {
      await ui.open(element);
      expect(shadow!.querySelector('.context-ready')?.textContent).toContain('1,200 characters');
      expect(shadow!.querySelector('.context-ready')?.textContent).toContain(
        'included automatically',
      );
      expect(shadow!.querySelector<HTMLDetailsElement>('.extra')?.open).toBe(false);
      expect(shadow!.activeElement?.textContent).toBe('Generate');
      sendMessage.mockResolvedValue({
        configured: false,
        issue: 'Add your provider key.',
        hasBackground: true,
        backgroundCharacters: 1200,
      });
      window.dispatchEvent(new Event('focus'));
      await vi.waitFor(() =>
        expect(shadow!.querySelector('.muted.error')?.textContent).toContain(
          'Add your provider key',
        ),
      );
      expect(
        [...shadow!.querySelectorAll('button')].find((button) => button.textContent === 'Generate')
          ?.disabled,
      ).toBe(true);
      expect(sendMessage.mock.calls.some(([message]) => message.type === 'eze-ai:generate')).toBe(
        false,
      );
    } finally {
      ui.dispose();
    }
  });
});
