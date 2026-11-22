// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.linkedin.com/jobs/search-results/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOB_FILTERS_KEY, type JobFilterSettings } from '../src/job-filter-rules';
import { mountLinkedInJobFilters } from '../src/linkedin-job-filters';

type StorageListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];
type Settings = JobFilterSettings | JobFilterSettings['titles'];
const enabled = { enabled: true, keywords: ['Sales', 'drone', 'business development'] };
let settings: Settings | undefined;
let get: ReturnType<typeof vi.fn<() => Promise<Record<string, unknown>>>>;
let dispose: (() => void) | undefined;
const observers = new Set<StorageListener>();
const dismiss = vi.fn<(id: string) => void>();
const extension = { id: '' };

function save(next: Settings) {
  settings = next;
  observers.forEach((listener) => listener({ [JOB_FILTERS_KEY]: { newValue: next } }, 'local'));
}
function results(): HTMLElement {
  const list = document.createElement('div');
  list.setAttribute('componentkey', 'SearchResultsMainContent');
  document.body.append(list);
  return list;
}
function card(
  id: string,
  title: string,
  parent: HTMLElement,
  company: string | null = 'Example Sales Company · Data Engineer',
) {
  const row = document.createElement('div');
  row.setAttribute('componentkey', `job-card-component-ref-${id}`);
  const opener = document.createElement('div');
  opener.setAttribute('role', 'button');
  const heading = document.createElement('p');
  const accessibleTitle = document.createElement('span');
  accessibleTitle.textContent = `${title} (Verified job)`;
  const visibleTitle = document.createElement('span');
  visibleTitle.setAttribute('aria-hidden', 'true');
  visibleTitle.textContent = title;
  heading.append(accessibleTitle, visibleTitle);
  const titleGroup = document.createElement('div');
  titleGroup.append(heading);
  const companyGroup = document.createElement('div');
  const companyName = document.createElement('p');
  companyName.textContent = company;
  companyGroup.append(companyName);
  const location = document.createElement('p');
  location.textContent = 'Example City (Remote)';
  opener.append(titleGroup);
  if (company !== null) opener.append(companyGroup);
  opener.append(location);
  const control = document.createElement('button');
  control.type = 'button';
  function render(dismissed: boolean) {
    control.setAttribute(
      'aria-label',
      dismissed ? `${title} job is dismissed, undo` : `Dismiss ${title} job`,
    );
  }
  render(false);
  control.addEventListener('click', () => {
    const current = control.getAttribute('aria-label')!.startsWith('Dismiss ');
    if (current) dismiss(id);
    render(current);
  });
  row.append(opener, control);
  parent.append(row);
  return { row, control, visibleTitle, companyName, location };
}
const settle = () => vi.advanceTimersByTimeAsync(1000);

beforeEach(() => {
  vi.useFakeTimers();
  settings = undefined;
  extension.id = 'ezeapply-test';
  observers.clear();
  dismiss.mockClear();
  history.replaceState({}, '', '/jobs/search-results/');
  get = vi.fn(async () => ({ [JOB_FILTERS_KEY]: settings }));
  vi.stubGlobal('chrome', {
    runtime: extension,
    storage: {
      local: { get },
      onChanged: {
        addListener: (fn: StorageListener) => observers.add(fn),
        removeListener: (fn: StorageListener) => observers.delete(fn),
      },
    },
  });
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('LinkedIn job filters', () => {
  it('retries an ignored native click for AI video Editor and respects Undo', async () => {
    settings = { enabled: true, keywords: ['Editor'] };
    const list = results();
    const editor = card('1', 'AI video Editor', list);
    card('2', 'AI Editorial Engineer', list);
    editor.control.addEventListener('click', (event) => event.stopImmediatePropagation(), {
      capture: true,
      once: true,
    });
    dispose = mountLinkedInJobFilters();
    await vi.advanceTimersByTimeAsync(150);
    expect(dismiss).not.toHaveBeenCalled();
    await settle();
    expect(dismiss.mock.calls).toEqual([['1']]);
    expect(editor.control.getAttribute('aria-label')).toContain('dismissed, undo');
    editor.control.click();
    await settle();
    expect(editor.control.getAttribute('aria-label')).toBe('Dismiss AI video Editor job');
    expect(dismiss.mock.calls).toEqual([['1']]);
  });

  it('limits retries when a native dismiss control keeps ignoring clicks', async () => {
    settings = { enabled: true, keywords: ['Editor'] };
    const listing = card('1', 'Video Editor', results());
    const ignored = vi.fn((event: Event) => event.stopImmediatePropagation());
    listing.control.addEventListener('click', ignored, true);
    dispose = mountLinkedInJobFilters();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ignored).toHaveBeenCalledTimes(2);
  });

  it('defaults off and dismisses only complete title matches inside the search results', async () => {
    const list = results();
    card('1', 'AI SALES Executive', list);
    card('2', 'Presales Executive', list);
    card('3', 'Drones & Robotics Engineering', list);
    card('4', 'Business-development Intern', list);
    card('5', 'Salesforce Engineer', list);
    card('6', 'Software Engineer', list);
    card('7', 'Sales Representative', document.body);
    card('8', 'Drone Engineer', list);
    card('9', 'Business Development Intern', list);
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(dismiss).not.toHaveBeenCalled();
    save(enabled);
    await settle();
    expect(dismiss.mock.calls).toEqual([['1'], ['8'], ['9']]);
  });

  it('requires the literal Data Engineer phrase with consecutive whole words', async () => {
    settings = { enabled: true, keywords: ['Data Engineer'] };
    const list = results();
    card('1', 'Data & AI Engineer (Kraków / Wrocław / Warsaw, Poland)', list);
    card('2', 'Data and AI Engineer', list);
    card('3', 'AI Engineer', list);
    card('4', 'Data-Engineer', list);
    card('5', 'Data Engineering', list);
    card('6', 'Senior DATA   ENGINEER (Remote)', list);
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(dismiss.mock.calls).toEqual([['6']]);
  });

  it('requires the visible title and Dismiss label to agree', async () => {
    settings = { enabled: true, keywords: ['Data Engineer'] };
    const list = results();
    const stale = card('1', 'Data & AI Engineer', list);
    stale.control.setAttribute('aria-label', 'Dismiss Data Engineer job');
    const match = card('2', 'Data Engineer', list);
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(dismiss.mock.calls).toEqual([['2']]);
    expect(stale.control.getAttribute('aria-label')).toBe('Dismiss Data Engineer job');
    expect(match.control.getAttribute('aria-label')).toContain('dismissed, undo');
  });

  it('preserves punctuation and does not expand saved words', async () => {
    settings = { enabled: true, keywords: ['Drones & Robotics', 'C++', 'Data Engineer, Platform'] };
    const list = results();
    card('1', 'Drones & Robotics Engineer', list);
    card('2', 'Drones and Robotics Engineer', list);
    card('3', 'Drone & Robotics Engineer', list);
    card('4', 'C++ Developer', list);
    card('5', 'C# Developer', list);
    card('6', 'Senior Data Engineer, Platform', list);
    card('7', 'Platform Engineer', list);
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(dismiss.mock.calls).toEqual([['1'], ['4'], ['6']]);
  });

  it('checks the next card after LinkedIn has had a chance to update its results', async () => {
    settings = { enabled: true, keywords: ['Data Engineer'] };
    const list = results();
    const first = card('1', 'Data Engineer', list);
    const recycled = card('2', 'Data Engineer', list);
    first.control.addEventListener('click', () => {
      void Promise.resolve().then(() => {
        recycled.visibleTitle.textContent = 'Data & AI Engineer';
      });
    });
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(dismiss.mock.calls).toEqual([['1']]);
  });

  it('matches the full visible company name and keeps title, location and similar names separate', async () => {
    settings = {
      titles: { enabled: false, keywords: ['Sales'] },
      companies: { enabled: true, keywords: ['Jobgether', 'Crossing Hurdles'] },
    };
    const list = results();
    card('1', 'Senior Data Scientist', list, 'Jobgether');
    card('2', 'ML Engineer', list, 'JOBGETHER');
    card('3', 'Sales Engineer', list, 'Jobgether Partners');
    card('4', 'Jobgether Developer', list, 'Example Systems');
    card('5', 'Support Engineer', list, null).location.textContent = 'Jobgether';
    card('6', 'IT Analyst', list, 'Jobgether').companyName.hidden = true;
    card('7', 'QA Engineer', list, 'Jobgether').control.setAttribute(
      'aria-label',
      'Dismiss Data Engineer job',
    );
    card('8', 'Research Scientist', list, 'Crossing   Hurdles');
    card('9', 'Software Engineer', document.body, 'Jobgether');
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(dismiss.mock.calls).toEqual([['1'], ['2'], ['8']]);
  });

  it('uses the employer field on legacy cards', async () => {
    settings = {
      titles: { enabled: false, keywords: [] },
      companies: { enabled: true, keywords: ['Example Labs, Inc.'] },
    };
    const list = document.createElement('div');
    list.className = 'jobs-search-results-list';
    document.body.append(list);
    const first = card('1', 'Software Engineer', list, 'Example Labs, Inc.');
    first.row.removeAttribute('componentkey');
    first.row.setAttribute('data-job-id', '1');
    first.visibleTitle.parentElement!.className = 'job-card-list__title';
    first.companyName.className = 'job-card-container__primary-description';
    const near = card('2', 'Research Engineer', list, 'Example Labs Inc');
    near.row.removeAttribute('componentkey');
    near.row.setAttribute('data-job-id', '2');
    near.visibleTitle.parentElement!.className = 'job-card-list__title';
    near.companyName.className = 'job-card-container__primary-description';
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(dismiss.mock.calls).toEqual([['1']]);
  });

  it('applies both enabled filters and switches each off independently', async () => {
    const titleList = { enabled: true, keywords: ['Data Engineer'] };
    const companyList = { enabled: true, keywords: ['Jobgether'] };
    settings = { titles: titleList, companies: companyList };
    const list = results();
    card('1', 'Senior Data Engineer', list, 'Example Labs');
    const companyMatch = card('2', 'AI Engineer', list, 'Jobgether');
    card('3', 'Data Engineer', list, 'Jobgether');
    card('4', 'Data & AI Engineer', list, 'Example Labs');
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(dismiss.mock.calls).toEqual([['1'], ['2'], ['3']]);

    companyMatch.control.click();
    save({ titles: titleList, companies: { ...companyList, enabled: false } });
    card('5', 'Research Scientist', list, 'Jobgether');
    card('6', 'Associate Data Engineer', list, 'Example Systems');
    await settle();
    expect(dismiss.mock.calls).toEqual([['1'], ['2'], ['3'], ['6']]);

    save({ titles: { ...titleList, enabled: false }, companies: companyList });
    card('7', 'Data Engineer', list, 'Example Systems');
    await settle();
    expect(dismiss.mock.calls).toEqual([['1'], ['2'], ['3'], ['6'], ['5']]);
  });

  it('handles lazy results, a user-selected next page and a full reload of the preference', async () => {
    settings = enabled;
    const page1 = results();
    const page2 = results();
    page2.hidden = true;
    card('1', 'AI Sales Executive', page1);
    card('2', 'Sales Development Representative', page2);
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(dismiss.mock.calls).toEqual([['1']]);
    card('3', 'Drone Software Engineer', page1);
    await settle();
    expect(dismiss.mock.calls).toEqual([['1'], ['3']]);

    history.pushState({}, '', '?start=25');
    page1.hidden = true;
    page2.hidden = false;
    await settle();
    expect(dismiss.mock.calls).toEqual([['1'], ['3'], ['2']]);

    dispose();
    page2.replaceChildren();
    card('2', 'Sales Development Representative', page2);
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(dismiss.mock.calls).toEqual([['1'], ['3'], ['2'], ['2']]);
  });

  it('respects Undo and avoids another dismissal when LinkedIn rebuilds the same card', async () => {
    settings = enabled;
    const list = results();
    const first = card('1', 'AI Sales Executive', list);
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(first.control.getAttribute('aria-label')).toContain('dismissed, undo');
    first.control.click();
    await settle();
    expect(first.control.getAttribute('aria-label')).toBe('Dismiss AI Sales Executive job');
    first.row.remove();
    card('1', 'AI Sales Executive', list);
    card('2', 'AI Sales Executive', list);
    await settle();
    expect(dismiss.mock.calls).toEqual([['1'], ['2']]);
  });

  it('leaves inactive tabs, busy or disabled cards, and controls behind an application dialog alone', async () => {
    settings = enabled;
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const list = results();
    const visible = card('1', 'Sales Executive', list);
    card('2', 'Sales Manager', list).control.disabled = true;
    card('3', 'Sales Specialist', list).row.setAttribute('aria-busy', 'true');
    card('4', 'Sales Intern', list).row.setAttribute('aria-hidden', 'true');
    const modal = document.createElement('dialog');
    modal.setAttribute('open', '');
    document.body.append(modal);
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(dismiss).not.toHaveBeenCalled();
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(dismiss).not.toHaveBeenCalled();
    modal.remove();
    await settle();
    expect(dismiss.mock.calls).toEqual([['1']]);
    expect(visible.control.getAttribute('aria-label')).toContain('dismissed, undo');
  });

  it('stops pending work when disabled and ignores non-search routes', async () => {
    settings = enabled;
    const list = results();
    history.replaceState({}, '', '/jobs/view/123/');
    card('1', 'Sales Executive', list);
    dispose = mountLinkedInJobFilters();
    await settle();
    expect(dismiss).not.toHaveBeenCalled();
    history.replaceState({}, '', '/jobs/search/');
    window.dispatchEvent(new PopStateEvent('popstate'));
    save({ ...enabled, enabled: false });
    await settle();
    expect(dismiss).not.toHaveBeenCalled();
    save({ enabled: true, keywords: ['???'] });
    await settle();
    expect(dismiss).not.toHaveBeenCalled();
    save(enabled);
    await settle();
    expect(dismiss.mock.calls).toEqual([['1']]);
  });

  it('does not dismiss from a stale content script after a Chrome extension reload', async () => {
    settings = enabled;
    card('1', 'Sales Executive', results());
    dispose = mountLinkedInJobFilters();
    extension.id = '';
    await settle();
    expect(dismiss).not.toHaveBeenCalled();
  });
});
