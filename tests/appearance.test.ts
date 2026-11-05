// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APPEARANCE_KEY, COLOR_THEMES, DEFAULT_THEME, colorTheme } from '../src/appearance-config';
import { applyAppearance, mountThemePicker, watchAppearance } from '../src/appearance';

let listeners: Set<Parameters<typeof chrome.storage.onChanged.addListener>[0]>;
let cleanup: (() => void)[];
let read: ReturnType<typeof vi.fn<() => Promise<Record<string, unknown>>>>;
let send: ReturnType<typeof vi.fn<(message: unknown) => Promise<{ ok: boolean }>>>;
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));
function change(value: unknown, area: chrome.storage.AreaName = 'local') {
  for (const listener of listeners) listener({ [APPEARANCE_KEY]: { newValue: value } }, area);
}
function luminance(hex: string) {
  const rgb = hex.match(/[a-f\d]{2}/gi)!.map((byte) => {
    const value = parseInt(byte, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (values[1] + 0.05) / (values[0] + 0.05);
}
beforeEach(() => {
  cleanup = [];
  listeners = new Set();
  read = vi.fn(async () => ({}));
  send = vi.fn(async () => ({ ok: true }));
  document.body.replaceChildren();
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.ezeTheme;
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: send },
    storage: {
      local: { get: read },
      onChanged: {
        addListener: vi.fn((listener) => listeners.add(listener)),
        removeListener: vi.fn((listener) => listeners.delete(listener)),
      },
    },
  });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
        this.dispatchEvent(new Event('close'));
      },
    },
  });
});
afterEach(() => {
  cleanup.forEach((dispose) => dispose());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  vi.unstubAllGlobals();
});

describe('muted color themes', () => {
  it('keeps text, secondary labels and button labels readable in every palette', () => {
    for (const { colors, label } of COLOR_THEMES) {
      for (const color of Object.values(colors)) expect(color).toMatch(/^#[a-f\d]{6}$/i);
      for (const surface of [colors.panel, colors.raised, colors.bg]) {
        for (const ink of [colors.text, colors.muted, colors.accent])
          expect(contrast(ink, surface), `${label}: ${ink} on ${surface}`).toBeGreaterThanOrEqual(
            4.5,
          );
      }
      for (const surface of [colors.fill, colors.hover])
        expect(contrast('#ffffff', surface), `${label} button`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('restores the saved choice after startup and reacts to other extension views', async () => {
    read.mockResolvedValue({ [APPEARANCE_KEY]: 'blue' });
    cleanup.push(watchAppearance(document));
    await flush();
    expect(document.documentElement.dataset.ezeTheme).toBe('blue');
    change('pine', 'sync');
    expect(document.documentElement.dataset.ezeTheme).toBe('blue');
    change('violet');
    expect(document.documentElement.dataset.ezeTheme).toBe('violet');
    expect(document.documentElement.style.getPropertyValue('--ui-panel')).toBe(
      colorTheme('violet').colors.panel,
    );
  });
  it.each(['storage', 'picker'])(
    'does not let a delayed startup read replace a newer %s choice',
    async (source) => {
      let finish!: (data: Record<string, unknown>) => void;
      read.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      cleanup.push(watchAppearance(document));
      if (source === 'storage') change('rosewood');
      else applyAppearance(document, 'rosewood');
      finish({ [APPEARANCE_KEY]: 'blue' });
      await flush();
      expect(document.documentElement.dataset.ezeTheme).toBe('rosewood');
    },
  );
  it('uses the default for missing or invalid preferences without rewriting storage', async () => {
    read.mockRejectedValue(new Error('Unavailable'));
    cleanup.push(watchAppearance(document));
    await flush();
    expect(document.documentElement.dataset.ezeTheme).toBe(DEFAULT_THEME);
    change('url(https://example.test/inject)');
    expect(document.documentElement.dataset.ezeTheme).toBe(DEFAULT_THEME);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
  it('removes subscriptions and ignores unfinished reads when the view closes', async () => {
    let finish!: (data: Record<string, unknown>) => void;
    read.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const stop = watchAppearance(document);
    stop();
    expect(listeners.size).toBe(0);
    finish({ [APPEARANCE_KEY]: 'blue' });
    await flush();
    expect(document.documentElement.dataset.ezeTheme).toBe(DEFAULT_THEME);
  });
});

function openPicker() {
  applyAppearance(document, 'midnight');
  const picker = mountThemePicker(document);
  cleanup.push(picker.dispose);
  document.body.append(picker.button);
  picker.button.click();
  const dialog = document.querySelector('dialog')!;
  const choose = (id: string) =>
    dialog.querySelector<HTMLInputElement>(`input[value="${id}"]`)!.click();
  return { picker, dialog, choose };
}
describe('theme picker', () => {
  it('offers eight named options, persists a choice and restores focus on close', async () => {
    const { picker, dialog, choose } = openPicker();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelectorAll('input[type="radio"]')).toHaveLength(8);
    choose('magenta');
    expect(document.documentElement.dataset.ezeTheme).toBe('magenta');
    await flush();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'eze-app:appearance',
      theme: 'magenta',
    });
    expect(dialog.querySelector<HTMLElement>('[role="status"]')?.textContent).toContain(
      'Saved on this device',
    );
    expect(dialog.querySelector('input:checked')?.getAttribute('value')).toBe('magenta');
    dialog.querySelector<HTMLButtonElement>('[aria-label="Close color themes"]')!.click();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(picker.button);
    picker.button.click();
    expect(dialog.querySelector('input:checked')?.getAttribute('value')).toBe('magenta');
    expect(document.querySelectorAll('dialog')).toHaveLength(1);
  });
  it('restores the previous appearance and exposes an error when saving fails', async () => {
    send.mockRejectedValue(new Error('Storage is unavailable. Try again.'));
    const { dialog, choose } = openPicker();
    choose('sandstone');
    await flush();
    expect(document.documentElement.dataset.ezeTheme).toBe('midnight');
    expect(dialog.querySelector('.is-error')?.textContent).toContain('Try again');
    expect(dialog.querySelector('fieldset')?.disabled).toBe(false);
  });
  it('keeps a newer external choice if an earlier save fails', async () => {
    let reject!: (reason: unknown) => void;
    send.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const { choose } = openPicker();
    choose('pine');
    applyAppearance(document, 'blue');
    reject(new Error('Failed'));
    await flush();
    expect(document.documentElement.dataset.ezeTheme).toBe('blue');
  });
});
