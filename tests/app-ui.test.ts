// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, safeWebsite, profileDate } from '../src/app-ui';
import { TRACKING_DAILY_TOTALS_KEY } from '../src/tracking-types';
import { localDayKey } from '../src/tracking-model';
let data: Record<string, unknown>, cleanup: (() => void) | undefined;
beforeEach(() => {
  data = {
    profile: {
      nameData: { firstName: 'Alex', lastName: 'Sharma' },
      contactData: { email: 'alex@example.test' },
      employmentData: { workAuthorization: true },
      jobData: [{ company: 'Example', startDate: { month: 2, year: 2024 } }],
    },
    dailyGoal: 10,
    [TRACKING_DAILY_TOTALS_KEY]: { [localDayKey()]: { total: 14 } },
  };
  document.body.innerHTML = '<div id="root"></div>';
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'test',
      getURL: (path: string) => `chrome-extension://test/${path}`,
      getManifest: () => ({ version: '3.0.0' }),
      sendMessage: vi.fn(async () => ({
        ok: true,
        snapshot: { records: [], adjustments: {}, goal: 10, goalHistory: {} },
      })),
    },
    windows: { getCurrent: async () => ({ id: 7 }) },
    tabs: { create: vi.fn() },
    sidePanel: { open: vi.fn(async () => {}) },
    storage: {
      local: { get: vi.fn(async () => data) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
describe('independent application host', () => {
  it('keeps the compact popup and exposes the same local switches, goal controls and analytics entry', async () => {
    history.replaceState({}, '', '/popup.html');
    cleanup = await mountApp(document.getElementById('root')!);
    expect(document.querySelector('.daily-total')?.textContent).toBe('14');
    expect(document.querySelectorAll('.popup-shortcuts>*')).toHaveLength(4);
    expect(document.querySelector('[aria-label="Edit daily goal"]')).not.toBeNull();
    expect(document.querySelectorAll('.popup-switches input')).toHaveLength(4);
    expect(document.querySelector('.daily-goal')?.textContent).toBe('Goal: 10');
  });
  it('opens the native side panel directly from a popup gesture', async () => {
    history.replaceState({}, '', '/popup.html');
    cleanup = await mountApp(document.getElementById('root')!);
    vi.spyOn(window, 'close').mockImplementation(() => {});
    document.querySelector<HTMLButtonElement>('.quick-access')!.click();
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 });
  });
  it('refreshes the profile cards after edits without disturbing the saved-answer panel', async () => {
    history.replaceState({}, '', '/sidepanel.html');
    const answers = document.createElement('div');
    answers.id = 'eze-custom-root';
    answers.textContent = 'Saved answers stay here';
    document.body.prepend(answers);
    cleanup = await mountApp(document.getElementById('root')!);
    expect(document.querySelector('[aria-label="Copy Legal Name"]')?.textContent).toBe(
      'Alex Sharma',
    );
    const callbacks = vi.mocked(chrome.storage.onChanged.addListener).mock.calls.map(([fn]) => fn);
    for (const fn of callbacks)
      fn({ profile: { newValue: { nameData: { firstName: 'Sam' } } } }, 'local');
    expect(document.querySelector('[aria-label="Copy Legal Name"]')?.textContent).toBe('Sam');
    expect(document.querySelectorAll('.profile-cards')).toHaveLength(1);
    expect(answers.textContent).toBe('Saved answers stay here');
    expect(document.querySelectorAll('.profile-section-heading h2 svg')).toHaveLength(5);
  });
  it('saves edited profile fields while preserving untouched structured dates and booleans', async () => {
    history.replaceState({}, '', '/options.html#/profile');
    cleanup = await mountApp(document.getElementById('root')!);
    const first = [...document.querySelectorAll('label')]
      .find((label) => label.textContent === 'First name')!
      .querySelector('input')!;
    first.value = 'Sam';
    first.dispatchEvent(new Event('input', { bubbles: true }));
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'eze-app:save-profile',
          profile: expect.objectContaining({
            nameData: expect.objectContaining({ firstName: 'Sam' }),
            employmentData: expect.objectContaining({ workAuthorization: true }),
            jobData: [expect.objectContaining({ startDate: { month: 2, year: 2024 } })],
          }),
        }),
      ),
    );
    await vi.waitFor(() =>
      expect(document.querySelector('.app-status')?.textContent).toBe('Profile saved.'),
    );
    first.value = 'Alex';
    first.dispatchEvent(new Event('input', { bubbles: true }));
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() =>
      expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: 'eze-app:save-profile',
          profile: expect.objectContaining({
            nameData: expect.objectContaining({ firstName: 'Alex' }),
          }),
        }),
      ),
    );
  });
  it('keeps the AI entry prominent on Settings and renders user strings as text', async () => {
    data.profile = { nameData: { firstName: '<img src=x onerror=alert(1)>' } };
    history.replaceState({}, '', '/options.html#/settings/autofill');
    cleanup = await mountApp(document.getElementById('root')!);
    expect(document.querySelectorAll('[data-eze-ai-hero]')).toHaveLength(1);
    expect(document.querySelector('button[onclick]')).toBeNull();
    expect(document.querySelector('.app-main')?.textContent).toContain('Configure AI');
  });
  it('does not navigate to scripts or embedded credentials from imported application URLs', () => {
    expect(safeWebsite('javascript:alert(1)')).toBe('');
    expect(safeWebsite('https://key@example.test')).toBe('');
    expect(safeWebsite('https://example.test/apply')).toBe('https://example.test/apply');
  });
  it('displays imported structured dates instead of appearing to lose them', () => {
    expect(profileDate({ month: 2, year: 2024 })).toBe('2024-02');
    expect(profileDate('2025-06')).toBe('2025-06');
    expect(profileDate({ month: 99, year: 2024 })).toBe('');
  });
});
