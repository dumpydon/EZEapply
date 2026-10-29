// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAnalytics, mountAnalytics } from '../src/analytics';
import { localDayKey } from '../src/tracking-model';
import { TRACKING_CACHE_KEY, type TrackingSnapshot } from '../src/tracking-types';
let data: TrackingSnapshot, cleanup: (() => void) | undefined;
const listeners = new Set<Parameters<typeof chrome.storage.onChanged.addListener>[0]>();
const getButton = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === name || button.getAttribute('aria-label') === name,
  )!;
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
beforeEach(() => {
  document.body.innerHTML = '<div id="analytics"></div>';
  listeners.clear();
  data = {
    goal: 10,
    goalHistory: { [localDayKey()]: 10 },
    adjustments: { [localDayKey()]: 2 },
    records: [
      {
        id: 'one',
        source: 'linkedin',
        jobTitle: 'Research Engineer',
        company: 'Example',
        url: 'https://example.test/job/1',
        submittedAt: new Date().toISOString(),
        status: 'confirmed',
        evidence: 'Application sent',
      },
      {
        id: 'two',
        source: 'external',
        jobTitle: 'Platform Engineer',
        company: 'Other',
        url: 'https://example.test/job/2',
        submittedAt: new Date().toISOString(),
        status: 'confirmed',
        evidence: 'Your application was submitted',
      },
    ],
  };
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'fixture',
      getURL: (path: string) => `chrome-extension://fixture/${path}`,
      sendMessage: vi.fn(async (message: { type: string; goal: number }) => {
        if (message.type === 'eze-tracking:set-goal') data = { ...data, goal: message.goal };
        return { ok: true, snapshot: structuredClone(data) };
      }),
    },
    storage: {
      onChanged: {
        addListener: (fn: any) => listeners.add(fn),
        removeListener: (fn: any) => listeners.delete(fn),
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
async function mount() {
  cleanup = mountAnalytics(document.getElementById('analytics')!);
  await settle();
}
describe('separate application analytics page', () => {
  it('shows the source breakdown, daily period and manual corrections without fabricating source attribution', async () => {
    await mount();
    expect(document.querySelectorAll('.day-column')).toHaveLength(7);
    expect(document.querySelector('.primary-metric .metric-value')?.textContent).toBe('4');
    expect(document.querySelectorAll('.submission-row')).toHaveLength(2);
    expect(document.body.textContent).toContain('LinkedIn Easy Apply');
    expect(document.body.textContent).toContain('Manual corrections');
    expect(document.querySelector('.metric.positive .metric-value')?.textContent).toBe(
      'New activity',
    );
  });
  it('switches 7/15/30-day periods and filters the submission journal with keyboard-friendly buttons', async () => {
    await mount();
    getButton('15 days').click();
    expect(document.querySelectorAll('.day-column')).toHaveLength(15);
    expect(getButton('15 days').getAttribute('aria-pressed')).toBe('true');
    getButton('30 days').click();
    expect(document.querySelectorAll('.day-column')).toHaveLength(30);
    getButton('LinkedIn').click();
    expect(document.querySelectorAll('.submission-row')).toHaveLength(1);
    expect(document.querySelector('.submission-title')?.textContent).toBe('Research Engineer');
    getButton('View daily data')?.click();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(30);
  });
  it('edits the shared goal without changing application records', async () => {
    await mount();
    getButton('DAILY GOAL10 applicationsEdit goal ↗').click();
    const input = document.querySelector<HTMLInputElement>('#daily-goal-value')!;
    input.value = '25';
    getButton('Save goal').click();
    await settle();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'eze-tracking:set-goal',
      goal: 25,
    });
    expect(data.records).toHaveLength(2);
    expect(document.querySelector('.goal-trigger')?.textContent).toContain('25 applications');
  });
  it('has an intentional empty state and no invented percentage', async () => {
    data = { ...data, records: [], adjustments: {} };
    await mount();
    expect(document.body.textContent).toContain('Your next application starts the story.');
    expect(document.querySelector('.metric.positive .metric-value')?.textContent).toBe('—');
  });
  it('keeps a failed initial load recoverable with Refresh', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementationOnce(async () => ({
      error: 'Storage unavailable',
    }));
    await mount();
    expect(document.body.textContent).toContain('Storage unavailable');
    getButton('Refresh analytics').click();
    await settle();
    expect(document.querySelector('.primary-metric .metric-value')?.textContent).toBe('4');
  });
  it('refreshes after a worker cache update', async () => {
    await mount();
    data = { ...data, goal: 20 };
    listeners.forEach((fn) => fn({ [TRACKING_CACHE_KEY]: { newValue: data } }, 'local'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(document.querySelector('.goal-trigger')?.textContent).toContain('20 applications');
  });
  it('exports only tracking data, escapes CSV formulas and retains corrections without reading credentials', () => {
    data.records[0].jobTitle = '=HYPERLINK("bad")';
    const withSecrets = { ...data, apiKey: 'never-export', resumeText: 'private resume' };
    const json = exportAnalytics(withSecrets, 7, 'json');
    expect(json).not.toContain('never-export');
    expect(json).not.toContain('private resume');
    expect(JSON.parse(json).records).toHaveLength(2);
    const csv = exportAnalytics(withSecrets, 7, 'csv');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('Unclassified manual correction');
  });
  it('renders untrusted titles as text and never creates executable links', async () => {
    data.records[0].jobTitle = '<img src=x onerror=alert(1)>';
    data.records[0].url = 'javascript:alert(1)';
    await mount();
    expect(document.querySelector('.submission-title')?.textContent).toContain('<img');
    expect(document.querySelector('.submission-title')?.tagName).toBe('STRONG');
    expect(document.querySelectorAll('.submission-list img')).toHaveLength(0);
  });
});
