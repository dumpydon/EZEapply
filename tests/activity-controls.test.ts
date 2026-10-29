// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountActivityControls } from '../src/activity-controls';
let cleanup: (() => void) | undefined;
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
const edit = () => document.querySelector<HTMLButtonElement>('[aria-label="Edit daily goal"]')!;
beforeEach(() => {
  document.body.innerHTML =
    '<div id="root"><span class="eze-count-controls"></span><div><button title="View Applications" class="native-circle">Applications</button><button title="Manage Profile">Profile</button><button title="Manage Settings">Settings</button></div></div>';
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage: vi.fn(async () => ({ ok: true })),
    },
    storage: { local: { get: vi.fn(async () => ({ dailyGoal: 10 })) } },
  });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
describe('compact analytics entry and quick goal editing', () => {
  it('keeps the existing three shortcuts and adds one matching analytics entry without dashboards', () => {
    const view = mountActivityControls();
    cleanup = view.dispose;
    view.decorate();
    expect(
      document.querySelectorAll(
        '#root button[title^="Manage"],#root button[title="View Applications"]',
      ),
    ).toHaveLength(3);
    expect(document.querySelectorAll('.eze-analytics-shortcut')).toHaveLength(1);
    expect(document.querySelector('.eze-analytics-shortcut')?.getAttribute('href')).toBe(
      'chrome-extension://test/analytics.html',
    );
    expect(
      document.querySelector('.eze-analytics-shortcut')?.classList.contains('native-circle'),
    ).toBe(true);
    expect(edit().parentElement?.className).toBe('eze-count-controls');
  });
  it('opens the current goal, validates it, and saves through the shared worker action', async () => {
    const view = mountActivityControls();
    cleanup = view.dispose;
    edit().click();
    await settle();
    const input = document.querySelector<HTMLInputElement>('dialog input')!;
    expect(input.value).toBe('10');
    const form = document.querySelector('dialog form')!;
    input.value = '0';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    input.value = '25';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'eze-tracking:set-goal',
      goal: 25,
    });
    expect(document.querySelector('dialog')).toBeNull();
  });
  it('preserves a typed goal if the initial preference read finishes late', async () => {
    let finish: (value: Record<string, unknown>) => void = () => {};
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = mountActivityControls();
    cleanup = view.dispose;
    edit().click();
    const input = document.querySelector<HTMLInputElement>('dialog input')!;
    input.value = '35';
    input.dispatchEvent(new Event('input'));
    finish({ dailyGoal: 10 });
    await settle();
    expect(input.value).toBe('35');
  });
  it('shows a failed save and keeps the editor available', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementationOnce(async () => ({
      error: 'Save interrupted',
    }));
    const view = mountActivityControls();
    cleanup = view.dispose;
    edit().click();
    await settle();
    document
      .querySelector('dialog form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Save interrupted');
    expect(
      document.querySelector<HTMLButtonElement>('dialog button[type="submit"]')?.disabled,
    ).toBe(false);
  });
});
