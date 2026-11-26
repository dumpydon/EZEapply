// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountApp, safeWebsite, profileDate } from '../src/app-ui';
import { TRACKING_DAILY_TOTALS_KEY } from '../src/tracking-types';
import { utcDayKey } from '../src/application-day';
import { JOB_FILTERS_KEY } from '../src/job-filter-rules';
import { FEED_FOCUS_KEY } from '../src/feed-focus-settings';
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
    [TRACKING_DAILY_TOTALS_KEY]: { [utcDayKey()]: { total: 14 } },
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
      local: {
        get: vi.fn(async () => data),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(data, values);
        }),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
describe('independent application host', () => {
  it.each(['/popup.html', '/sidepanel.html'])(
    'refreshes an open %s at midnight UTC without changing the goal or yesterday’s history',
    async (path) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-01T23:59:59.999+05:30'));
      data[TRACKING_DAILY_TOTALS_KEY] = { '2026-11-01': { total: 14 } };
      history.replaceState({}, '', path);
      cleanup = await mountApp(document.getElementById('root')!);
      await vi.advanceTimersByTimeAsync(0);
      expect(document.querySelector('.daily-total')?.textContent).toBe('14');
      await vi.advanceTimersByTimeAsync(1);
      expect(document.querySelector('.daily-total')?.textContent).toBe('14');
      await vi.advanceTimersByTimeAsync(5.5 * 60 * 60 * 1000);
      expect(document.querySelector('.daily-total')?.textContent).toBe('0');
      expect(document.querySelector('.daily-goal')?.textContent).toBe('Goal: 10');
      const ring = document.querySelector<SVGElement>('.ring-value');
      if (path === '/popup.html') expect(ring?.style.opacity).toBe('0');
      else
        expect(document.querySelector<HTMLElement>('.daily-progress-value')?.style.width).toBe(
          '0%',
        );
      expect(data[TRACKING_DAILY_TOTALS_KEY]).toEqual({ '2026-11-01': { total: 14 } });
    },
  );
  it('keeps the compact popup and exposes the same local switches, goal controls and analytics entry', async () => {
    history.replaceState({}, '', '/popup.html');
    cleanup = await mountApp(document.getElementById('root')!);
    expect(document.querySelector('.daily-total')?.textContent).toBe('14');
    expect(document.querySelectorAll('.popup-shortcuts>*')).toHaveLength(6);
    expect(
      document
        .querySelector('.popup-shortcuts [aria-label="Job Filters"] img')
        ?.getAttribute('src'),
    ).toContain('navigation/job-filters.png');
    expect(document.querySelector('[aria-label="Feed Focus"] img')?.getAttribute('src')).toContain(
      'navigation/feed-focus.png',
    );
    expect(document.querySelector('[aria-label="Edit daily goal"]')).not.toBeNull();
    expect(document.querySelectorAll('.popup-switches input')).toHaveLength(4);
    expect(document.querySelector('.daily-goal')?.textContent).toBe('Goal: 10');
  });
  it('configures Feed Focus from the popup and remembers a custom quote when switched off', async () => {
    history.replaceState({}, '', '/popup.html');
    cleanup = await mountApp(document.getElementById('root')!);
    const button = document.querySelector<HTMLButtonElement>('[aria-label="Feed Focus"]')!;
    const open = async () => {
      button.click();
      const dialog = document.querySelector<HTMLDialogElement>('.feed-focus-dialog')!;
      const toggle = dialog.querySelector('input')!;
      await vi.waitFor(() => expect(toggle.disabled).toBe(false));
      return {
        dialog,
        toggle,
        choice: dialog.querySelector('select')!,
        custom: dialog.querySelector('textarea')!,
        form: dialog.querySelector('form')!,
      };
    };
    const first = await open();
    expect(first.toggle.checked).toBe(false);
    expect(first.choice.options).toHaveLength(4);
    first.toggle.checked = true;
    first.choice.value = 'custom';
    first.choice.dispatchEvent(new Event('change', { bubbles: true }));
    expect(first.custom.parentElement?.hidden).toBe(false);
    first.form.requestSubmit();
    expect(first.custom.getAttribute('aria-invalid')).toBe('true');
    expect(data[FEED_FOCUS_KEY]).toBeUndefined();
    first.custom.value = 'Finish the application.';
    first.form.requestSubmit();
    await vi.waitFor(() => expect(first.dialog.isConnected).toBe(false));
    expect(button.dataset.enabled).toBe('true');
    const settings = { enabled: true, quote: 'custom', customQuote: 'Finish the application.' };
    expect(data[FEED_FOCUS_KEY]).toEqual(settings);

    const reopened = await open();
    expect(reopened.toggle.checked).toBe(true);
    expect(reopened.custom.value).toBe(settings.customQuote);
    reopened.toggle.checked = false;
    reopened.form.requestSubmit();
    await vi.waitFor(() => expect(reopened.dialog.isConnected).toBe(false));
    expect(data[FEED_FOCUS_KEY]).toEqual({ ...settings, enabled: false });
  });
  it('carries over the old title filter and saves the company list and switch independently', async () => {
    history.replaceState({}, '', '/popup.html');
    const old = {
      enabled: true,
      keywords: ['Sales', 'Data Engineer, Platform', 'Drones & Robotics'],
    };
    data[JOB_FILTERS_KEY] = old;
    const root = document.getElementById('root')!;
    cleanup = await mountApp(root);
    const open = async () => {
      root.querySelector<HTMLButtonElement>('button[aria-label="Job Filters"]')!.click();
      const dialog = document.querySelector<HTMLDialogElement>('.job-filters-dialog')!;
      const titleToggle = dialog.querySelector<HTMLInputElement>('input[name="titles-enabled"]')!;
      const companyToggle = dialog.querySelector<HTMLInputElement>(
        'input[name="companies-enabled"]',
      )!;
      await vi.waitFor(() => expect(companyToggle.disabled).toBe(false));
      return {
        dialog,
        titleToggle,
        companyToggle,
        titles: dialog.querySelector<HTMLTextAreaElement>('#job-filter-titles-list')!,
        companies: dialog.querySelector<HTMLTextAreaElement>('#job-filter-companies-list')!,
      };
    };
    const first = await open();
    expect(first.titleToggle.checked).toBe(true);
    expect(first.titles.value).toBe(old.keywords.join('\n'));
    expect(first.companyToggle.checked).toBe(false);
    expect(first.companies.value).toBe('');
    first.companyToggle.checked = true;
    const titleExpand = first.dialog.querySelector<HTMLButtonElement>(
      '[aria-controls="job-filter-titles-list"]',
    )!;
    const companyExpand = first.dialog.querySelector<HTMLButtonElement>(
      '[aria-controls="job-filter-companies-list"]',
    )!;
    titleExpand.click();
    expect(titleExpand.getAttribute('aria-expanded')).toBe('true');
    expect(first.companies.closest('section')?.hidden).toBe(true);
    first.dialog.querySelector('form')!.requestSubmit();
    expect(first.companies.getAttribute('aria-invalid')).toBe('true');
    expect(first.dialog.querySelector('[role="alert"]')?.textContent).toContain('company name');
    expect(companyExpand.getAttribute('aria-expanded')).toBe('true');
    expect(first.companies.closest('section')?.hidden).toBe(false);
    expect(document.activeElement).toBe(first.companies);
    expect(data[JOB_FILTERS_KEY]).toEqual(old);

    first.titleToggle.checked = false;
    first.companies.value = 'Jobgether\n JOBGETHER \nCrossing Hurdles, Inc.\n***';
    first.dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(companyExpand.getAttribute('aria-expanded')).toBe('false');
    expect(first.titles.closest('section')?.hidden).toBe(false);
    expect(first.companies.value).toContain('Crossing Hurdles');
    expect(document.activeElement).toBe(companyExpand);
    first.dialog.querySelector('form')!.requestSubmit();
    await vi.waitFor(() => expect(first.dialog.isConnected).toBe(false));
    expect(data[JOB_FILTERS_KEY]).toEqual({
      titles: { ...old, enabled: false },
      companies: { enabled: true, keywords: ['Jobgether', 'Crossing Hurdles, Inc.'] },
      exceptions: { enabled: false, keywords: [] },
    });
    cleanup();
    cleanup = await mountApp(root);
    const reopened = await open();
    expect(reopened.titles.value).toBe(old.keywords.join('\n'));
    expect(reopened.titleToggle.checked).toBe(false);
    expect(reopened.companies.value).toBe('Jobgether\nCrossing Hurdles, Inc.');
    expect(reopened.companyToggle.checked).toBe(true);
    const keep = reopened.dialog.querySelector<HTMLButtonElement>('.job-filter-exceptions-link')!;
    const keepGroup = reopened.dialog.querySelector<HTMLElement>('#job-filter-exceptions-group')!;
    expect(keepGroup.hidden).toBe(true);
    keep.click();
    expect(keepGroup.hidden).toBe(false);
    const keepToggle = keepGroup.querySelector('input')!;
    const keepRules = keepGroup.querySelector('textarea')!;
    expect(keepToggle.checked).toBe(false);
    keepToggle.checked = true;
    keepRules.value = 'Intern +';
    reopened.dialog.querySelector('form')!.requestSubmit();
    expect(keepRules.getAttribute('aria-invalid')).toBe('true');
    keepRules.value = 'Intern + Remote\nC++ + Hybrid';
    keep.click();
    expect(keepGroup.hidden).toBe(true);
    expect(keepRules.value).toBe('Intern + Remote\nC++ + Hybrid');
    reopened.companyToggle.checked = false;
    reopened.titleToggle.checked = true;
    reopened.dialog.querySelector('form')!.requestSubmit();
    await vi.waitFor(() => expect(reopened.dialog.isConnected).toBe(false));
    expect(data[JOB_FILTERS_KEY]).toEqual({
      titles: old,
      companies: { enabled: false, keywords: ['Jobgether', 'Crossing Hurdles, Inc.'] },
      exceptions: { enabled: true, keywords: ['Intern + Remote', 'C++ + Hybrid'] },
    });
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
