// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPopupControls } from '../src/popup-controls';
import {
  LINKEDIN_NOFOLLOW_KEY,
  PANEL_RESTORE_KEY,
  STORAGE_KEY,
  type CustomStore,
} from '../src/types';

let cleanup: (() => void) | undefined;
type StorageListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];
const listeners = new Set<StorageListener>();
let data: Record<string, unknown>;
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
function toggle() {
  return document.querySelector<HTMLInputElement>(
    '[aria-label="Show closed panel floating button"]',
  )!;
}
function autoToggle() {
  return document.querySelector<HTMLInputElement>('[aria-label="Auto-fill saved answers"]')!;
}
beforeEach(() => {
  data = {};
  listeners.clear();
  document.body.innerHTML =
    '<div id="root"><div><button>Quick Access</button><label><button role="switch"></button><span>Autofill Enabled</span></label></div></div>';
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn(async (message: { type: string; profileId: string; enabled: boolean }) => {
        if (
          message.profileId !==
          ((data.lastSyncProfile as { id?: string } | undefined)?.id || 'local')
        )
          return { error: 'Your profile changed. Try again.' };
        const store = structuredClone(
          data[STORAGE_KEY] || { version: 1, profiles: {} },
        ) as CustomStore;
        store.profiles[message.profileId] = {
          ...(store.profiles[message.profileId] || { fields: [], autoFill: true }),
          autoFill: message.enabled,
        };
        await chrome.storage.local.set({ [STORAGE_KEY]: store });
        return { ok: true };
      }),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({ ...data })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(data, values);
          const changes = Object.fromEntries(
            Object.entries(values).map(([key, value]) => [key, { newValue: value }]),
          );
          listeners.forEach((fn) => fn(changes, 'local'));
        }),
      },
      onChanged: {
        addListener: (fn: StorageListener) => listeners.add(fn),
        removeListener: (fn: StorageListener) => listeners.delete(fn),
      },
    },
  });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
describe('popup floating-button control', () => {
  it('sits below Autofill, starts off and preserves the saved choice when the popup reopens', async () => {
    const control = mountPopupControls();
    cleanup = control.dispose;
    await settle();
    expect(autoToggle().closest('label')?.previousElementSibling?.textContent).toBe(
      'Autofill Enabled',
    );
    expect(
      toggle().closest('label')?.previousElementSibling?.previousElementSibling?.textContent,
    ).toBe('Auto-fill saved answers');
    expect(toggle().checked).toBe(false);
    toggle().click();
    await settle();
    expect(data[PANEL_RESTORE_KEY]).toBe(true);
    expect(toggle().checked).toBe(true);
    cleanup();
    const reopened = mountPopupControls();
    cleanup = reopened.dispose;
    await settle();
    expect(toggle().checked).toBe(true);
    toggle().click();
    await settle();
    expect(data[PANEL_RESTORE_KEY]).toBe(false);
  });
  it('shows a save failure without changing the saved choice', async () => {
    const control = mountPopupControls();
    cleanup = control.dispose;
    await settle();
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('Storage unavailable'));
    toggle().click();
    await settle();
    expect(toggle().checked).toBe(false);
    expect(toggle().disabled).toBe(false);
    expect(document.querySelector('.eze-popup-floating + [role="status"]')?.textContent).toContain(
      'Could not save',
    );
  });
  it('restores one control after the retained popup rerenders', async () => {
    const control = mountPopupControls();
    cleanup = control.dispose;
    await settle();
    document.getElementById('root')!.innerHTML = '<div><label>Autofill Disabled</label></div>';
    control.decorate();
    control.decorate();
    expect(document.querySelectorAll('.eze-popup-floating')).toHaveLength(1);
    expect(document.querySelectorAll('.eze-popup-linkedin-follow')).toHaveLength(1);
    expect(document.querySelectorAll('.eze-popup-auto-fill')).toHaveLength(1);
    expect(autoToggle().closest('label')?.previousElementSibling?.textContent).toBe(
      'Autofill Disabled',
    );
  });
  it('keeps a newer cross-page preference when the initial read finishes late', async () => {
    const finish: Record<string, (value: Record<string, unknown>) => void> = {};
    vi.mocked(chrome.storage.local.get).mockImplementation(
      (key) =>
        new Promise((resolve) => {
          finish[String(key)] = resolve;
        }),
    );
    const control = mountPopupControls();
    cleanup = control.dispose;
    listeners.forEach((fn) => fn({ [PANEL_RESTORE_KEY]: { newValue: true } }, 'local'));
    finish[PANEL_RESTORE_KEY]({ [PANEL_RESTORE_KEY]: false });
    finish[LINKEDIN_NOFOLLOW_KEY]({});
    await settle();
    expect(toggle().checked).toBe(true);
  });
  it('saves and restores the independent LinkedIn opt-out toggle', async () => {
    const control = mountPopupControls();
    cleanup = control.dispose;
    await settle();
    const linkedIn = () =>
      document.querySelector<HTMLInputElement>('[aria-label="Turn off LinkedIn auto-follow"]')!;
    expect(linkedIn().checked).toBe(false);
    linkedIn().click();
    await settle();
    expect(data[LINKEDIN_NOFOLLOW_KEY]).toBe(true);
    expect(toggle().checked).toBe(false);
    cleanup();
    const reopened = mountPopupControls();
    cleanup = reopened.dispose;
    await settle();
    expect(linkedIn().checked).toBe(true);
    listeners.forEach((fn) => fn({ [LINKEDIN_NOFOLLOW_KEY]: { newValue: false } }, 'local'));
    expect(linkedIn().checked).toBe(false);
  });
});

describe('popup saved-answer auto-fill', () => {
  it('shares the existing per-profile preference and persists off/on across reopening', async () => {
    const profile = {
      autoFill: false,
      fields: [],
      hiddenBuiltIns: ['builtin:middle'],
      fieldOrder: ['builtin:last', 'builtin:first'],
    };
    data[STORAGE_KEY] = { version: 1, profiles: { local: profile } };
    let control = mountPopupControls();
    cleanup = control.dispose;
    await settle();
    expect(autoToggle().checked).toBe(false);
    expect(autoToggle().disabled).toBe(false);
    autoToggle().click();
    await settle();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'eze-custom:auto-fill',
      profileId: 'local',
      enabled: true,
    });
    expect((data[STORAGE_KEY] as CustomStore).profiles.local).toEqual({
      ...profile,
      autoFill: true,
    });
    cleanup();
    control = mountPopupControls();
    cleanup = control.dispose;
    await settle();
    expect(autoToggle().checked).toBe(true);
    autoToggle().click();
    await settle();
    expect((data[STORAGE_KEY] as CustomStore).profiles.local.autoFill).toBe(false);
    expect(data.autofillEnabled).toBeUndefined();
  });
  it('syncs sidebar changes and switches to the active profile without changing other profiles', async () => {
    data[STORAGE_KEY] = {
      version: 1,
      profiles: { local: { fields: [], autoFill: false }, other: { fields: [], autoFill: false } },
    };
    const control = mountPopupControls();
    cleanup = control.dispose;
    await settle();
    const store = structuredClone(data[STORAGE_KEY]) as CustomStore;
    store.profiles.local.autoFill = true;
    await chrome.storage.local.set({ [STORAGE_KEY]: store });
    await settle();
    expect(autoToggle().checked).toBe(true);
    await chrome.storage.local.set({ lastSyncProfile: { id: 'other' } });
    await settle();
    expect(autoToggle().checked).toBe(false);
    autoToggle().click();
    await settle();
    expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({
      type: 'eze-custom:auto-fill',
      profileId: 'other',
      enabled: true,
    });
    expect((data[STORAGE_KEY] as CustomStore).profiles.local.autoFill).toBe(true);
  });
  it('keeps the last saved choice and explains a failed save', async () => {
    data[STORAGE_KEY] = { version: 1, profiles: { local: { fields: [], autoFill: false } } };
    const control = mountPopupControls();
    cleanup = control.dispose;
    await settle();
    vi.mocked(chrome.runtime.sendMessage).mockImplementationOnce(async () => ({
      error: 'Could not save automatic filling. Try again.',
    }));
    autoToggle().click();
    await settle();
    expect(autoToggle().checked).toBe(false);
    expect(autoToggle().disabled).toBe(false);
    expect(document.querySelector('.eze-popup-auto-fill + [role="status"]')?.textContent).toContain(
      'Could not save',
    );
  });
  it('discards an initial preference read that finishes after a profile switch', async () => {
    let finish: (value: Record<string, unknown>) => void = () => {};
    vi.mocked(chrome.storage.local.get).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const control = mountPopupControls();
    cleanup = control.dispose;
    expect(autoToggle().disabled).toBe(true);
    await chrome.storage.local.set({
      lastSyncProfile: { id: 'other' },
      [STORAGE_KEY]: { version: 1, profiles: { other: { fields: [], autoFill: false } } },
    });
    await settle();
    expect(autoToggle().checked).toBe(false);
    finish({ [STORAGE_KEY]: { version: 1, profiles: { local: { fields: [], autoFill: true } } } });
    await settle();
    expect(autoToggle().checked).toBe(false);
    expect(autoToggle().disabled).toBe(false);
    autoToggle().click();
    await settle();
    expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({
      type: 'eze-custom:auto-fill',
      profileId: 'other',
      enabled: true,
    });
  });
});
