import { isLinkedInHost } from './linkedin-follow';
import {
  compileTitleFilter,
  JOB_FILTERS_KEY,
  normalizeJobFilterText,
  readJobFilters,
} from './job-filter-rules';

const SEARCH_PATH = /^\/jobs\/(?:search|search-results)\/?$/;
const RESULTS = '[componentkey="SearchResultsMainContent"],.jobs-search-results-list';
const MODERN_CARD = '[componentkey^="job-card-component-ref-"]';
const CARD = `${MODERN_CARD},[data-job-id],[data-occludable-job-id]`;
const LEGACY_TITLE =
  '.job-card-list__title,.job-card-list__title--link,a[data-control-name="job_card_title"]';
const LEGACY_COMPANY = '.job-card-container__primary-description,.job-card-container__company-name';
const DISMISS = /^Dismiss\s+(.+?)\s+job$/i;
const UNDO = /^.+\s+job is dismissed,\s*undo$/i;
const MODAL = 'dialog[open],[role="dialog"][aria-modal="true"],.jobs-easy-apply-modal';
const DISMISS_RETRY_MS = 900;

function visible(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.matches('[hidden],[inert],[aria-hidden="true"]')) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)) return false;
  }
  return element.isConnected;
}

function jobId(card: Element): string | undefined {
  const id =
    card.getAttribute('componentkey')?.match(/^job-card-component-ref-(\d+)$/)?.[1] ||
    card.getAttribute('data-job-id') ||
    card.getAttribute('data-occludable-job-id');
  if (id && /^\d+$/.test(id)) return id;
}

function resultCard(button: HTMLButtonElement): { card: Element; id: string } | undefined {
  const card = button.closest(CARD);
  if (!card || !card.closest(RESULTS) || button.closest('dialog,[role="dialog"],nav')) return;
  const id = jobId(card);
  if (id) return { card, id };
}

function resultText(element: Element | null, id: string): string {
  const owner = element?.closest(CARD);
  if (!element || !owner || jobId(owner) !== id || !visible(element)) return '';
  // LinkedIn renders an accessibility copy that can add a verification suffix.
  const displayed = element.querySelector(':scope > span[aria-hidden="true"]') ?? element;
  return normalizeJobFilterText(displayed.textContent || '');
}

function resultCompany(card: Element, title: Element, modern: boolean): Element | null {
  if (!modern) return card.querySelector(LEGACY_COMPANY);
  // The modern card places the company in its own wrapper between title and location.
  const company = title.parentElement?.nextElementSibling;
  if (company?.matches('div') && company.nextElementSibling?.matches('p'))
    return company.querySelector(':scope > p:only-child');
  return null;
}

/** Use the card’s own Dismiss button for matches in its title or company field. */
export function mountLinkedInJobFilters(): () => void {
  if (window.top !== window || !isLinkedInHost(location.hostname)) return () => {};
  let stopped = false;
  let changedSinceLoad = false;
  let titleFilters: RegExp[] = [];
  let companyFilters = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempts = new Map<string, { count: number; retryAt: number }>();
  const restored = new Set<string>();
  const enabled = () => titleFilters.length > 0 || companyFilters.size > 0;

  function scan(): void {
    timer = undefined;
    if (
      stopped ||
      !chrome.runtime?.id ||
      !enabled() ||
      document.visibilityState === 'hidden' ||
      !SEARCH_PATH.test(location.pathname) ||
      [...document.querySelectorAll(MODAL)].some(visible)
    )
      return;
    let nextRetryAt = Infinity;
    for (const list of document.querySelectorAll(RESULTS)) {
      if (!visible(list) || list.closest('[aria-busy="true"]')) continue;
      for (const button of list.querySelectorAll<HTMLButtonElement>('button[aria-label]')) {
        const title = DISMISS.exec(
          normalizeJobFilterText(button.getAttribute('aria-label') || ''),
        )?.[1];
        if (!title) continue;
        const titleMatch = titleFilters.some((filter) => filter.test(title));
        if (!titleMatch && !companyFilters.size) continue;
        const result = resultCard(button);
        if (!result || restored.has(result.id)) continue;
        const attempt = attempts.get(result.id);
        if (attempt?.count === 2) continue;
        const modern = result.card.matches(MODERN_CARD);
        const heading = result.card.querySelector(modern ? '[role="button"] p' : LEGACY_TITLE);
        if (!heading || resultText(heading, result.id) !== title) continue;
        if (
          !titleMatch &&
          !companyFilters.has(resultText(resultCompany(result.card, heading, modern), result.id))
        )
          continue;
        if (
          button.matches(':disabled') ||
          (button.form && button.type !== 'button') ||
          button.closest('[aria-disabled="true"],[aria-busy="true"]') ||
          !visible(button)
        )
          continue;
        // A click can be ignored while LinkedIn is updating the card. Retry once
        // only if the same job still has a matching, usable Dismiss control.
        if (attempt && Date.now() < attempt.retryAt) {
          nextRetryAt = Math.min(nextRetryAt, attempt.retryAt);
          continue;
        }
        attempts.set(result.id, {
          count: (attempt?.count ?? 0) + 1,
          retryAt: Date.now() + DISMISS_RETRY_MS,
        });
        button.click();
        // Let LinkedIn update the list before identifying another target.
        schedule();
        return;
      }
    }
    if (Number.isFinite(nextRetryAt))
      timer = setTimeout(scan, Math.max(0, nextRetryAt - Date.now()));
  }

  function schedule(): void {
    if (!stopped && enabled() && timer === undefined && SEARCH_PATH.test(location.pathname))
      timer = setTimeout(scan, 120);
  }

  function rememberUndo(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button');
    if (!button || !SEARCH_PATH.test(location.pathname)) return;
    if (!UNDO.test(button.getAttribute('aria-label')?.trim() || '')) return;
    const result = resultCard(button);
    if (result) restored.add(result.id);
  }

  const observer = new MutationObserver(schedule);
  function update(raw: unknown): void {
    clearTimeout(timer);
    timer = undefined;
    observer.disconnect();
    const settings = readJobFilters(raw);
    titleFilters = settings.titles.enabled ? settings.titles.keywords.map(compileTitleFilter) : [];
    companyFilters = new Set(
      settings.companies.enabled ? settings.companies.keywords.map(normalizeJobFilterText) : [],
    );
    if (!enabled()) return;
    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'aria-label',
        'role',
        'aria-hidden',
        'aria-busy',
        'aria-disabled',
        'aria-modal',
        'hidden',
        'inert',
        'disabled',
        'style',
        'class',
        'open',
        'componentkey',
        'data-job-id',
        'data-occludable-job-id',
      ],
    });
    schedule();
  }
  const onStorage: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (stopped || area !== 'local' || !changes[JOB_FILTERS_KEY]) return;
    changedSinceLoad = true;
    update(changes[JOB_FILTERS_KEY].newValue);
  };
  chrome.storage.onChanged.addListener(onStorage);
  void chrome.storage.local
    .get(JOB_FILTERS_KEY)
    .then((data) => {
      if (!stopped && !changedSinceLoad) update(data[JOB_FILTERS_KEY]);
    })
    .catch(() => {});
  document.addEventListener('click', rememberUndo, true);
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('popstate', schedule);
  window.addEventListener('pageshow', schedule);
  return () => {
    stopped = true;
    clearTimeout(timer);
    observer.disconnect();
    chrome.storage.onChanged.removeListener(onStorage);
    document.removeEventListener('click', rememberUndo, true);
    document.removeEventListener('visibilitychange', schedule);
    window.removeEventListener('popstate', schedule);
    window.removeEventListener('pageshow', schedule);
  };
}
