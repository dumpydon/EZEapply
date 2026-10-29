import { isApplicationField, isCommunicationPage } from './application-context';
import { composedParent } from './form-labels';

export interface SubmissionIntent {
  id: string;
  url: string;
  jobTitle: string;
  company: string;
  source: 'linkedin' | 'external';
  createdAt?: number | string;
}
interface CaptureOptions {
  root?: Document;
  url?: () => URL;
}
const DIALOG = 'dialog,[role="dialog"],.jobs-easy-apply-modal';
const FORM = `form,[role="form"],${DIALOG}`;
const TTL = 30 * 60 * 1000;
const EXCLUDED =
  /\b(?:chat|conversation|messaging|composer|comment|newsletter|subscribe|search|feedback|support|contact us|sign in|log in)\b/i;
const SUCCESS =
  /\b(?:(?:your (?:job )?)?application (?:has been |was |is )?(?:successfully )?(?:submitted|sent|received)|we (?:have |successfully )?received your (?:job )?application|thank(?:s| you) for (?:applying|your (?:job )?application)|your (?:response|responses) (?:has|have) been recorded)\b/i;
const LINKEDIN_SUCCESS =
  /^(?:application (?:sent|submitted)|your application (?:was |has been )?(?:sent|submitted))(?:[.!\s]|$)/i;
const FAILURE =
  /\b(?:unable to|failed to|could not|couldn.t|cannot|can.t|was not|wasn.t|has not|hasn.t|not successfully|not (?:submitted|sent|received)|error (?:sending|submitting)|already (?:applied|submitted))\b/i;
const METADATA_ATTRIBUTES = ['id', 'class', 'name', 'data-testid', 'data-test-id'];
function text(node: Element): string {
  const walk = node.ownerDocument.createTreeWalker(node, 4);
  let result = '',
    child: Node | null;
  while ((child = walk.nextNode()) && result.length < 6000) {
    if (child.parentElement?.closest('script,style,template,[hidden],[aria-hidden="true"]'))
      continue;
    result += ` ${child.textContent || ''}`;
  }
  return result.replace(/\s+/g, ' ').trim().slice(0, 6000);
}
function visible(element: Element): boolean {
  if (!element.isConnected) return false;
  for (let node: Element | null = element; node; node = composedParent(node)) {
    if (
      node.hasAttribute('hidden') ||
      node.hasAttribute('inert') ||
      node.getAttribute('aria-hidden') === 'true'
    )
      return false;
    if (node.tagName === 'DIALOG' && !node.hasAttribute('open')) return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse'
    )
      return false;
  }
  return true;
}
function identity(node: Element): string {
  return METADATA_ATTRIBUTES.map((name) => node.getAttribute(name) || '')
    .join(' ')
    .replace(/[_-]+/g, ' ');
}
function excluded(node: Element): boolean {
  for (
    let item: Element | null = node;
    item && !item.matches('body,html');
    item = composedParent(item)
  ) {
    if (
      item.matches('nav,footer,[role="log"],[role="feed"],[role="search"]') ||
      EXCLUDED.test(identity(item))
    )
      return true;
    if (item !== node && item.matches(FORM)) break;
  }
  return false;
}
function heading(scope: Element): string {
  return [scope.getAttribute('aria-label'), ...scope.querySelectorAll('h1,h2,h3,[role="heading"]')]
    .map((item) => (typeof item === 'string' ? item : item?.textContent || ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function linkedIn(url: URL): boolean {
  return url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com');
}

/** A final submission has to belong to an actual application. A careers URL
 * alone cannot turn newsletter, chat, login or search controls into tracking. */
export function submissionScope(
  control: HTMLElement,
  url = new URL(control.ownerDocument.location.href),
): Element | undefined {
  if (isCommunicationPage(url) || excluded(control)) return;
  for (
    let node: Element | null = control;
    node && !node.matches('body,html');
    node = composedParent(node)
  ) {
    if (!node.matches(FORM) || !visible(node)) continue;
    if (EXCLUDED.test(`${identity(node)} ${heading(node)}`)) return;
    if (linkedIn(url)) {
      if (
        node.matches(DIALOG) &&
        /\b(?:easy apply|apply to|review your application|submit application)\b/i.test(
          `${heading(node)} ${text(node).slice(0, 2500)}`,
        )
      )
        return node;
    } else if (isApplicationField(control, url)) return node;
  }
  if (!linkedIn(url) && isApplicationField(control, url))
    return control.closest('main,[role="main"]') || undefined;
}
function finalButton(button: HTMLElement, source: SubmissionIntent['source']): boolean {
  if (
    button.matches('a[href],input[type="image"]') ||
    button.hasAttribute('disabled') ||
    button.getAttribute('aria-disabled') === 'true'
  )
    return false;
  const label = (
    button.getAttribute('aria-label') ||
    ('value' in button ? (button as HTMLInputElement).value : '') ||
    text(button)
  )
    .replace(/\s+/g, ' ')
    .trim();
  if (/\b(?:next|continue|review|save|back|previous|cancel|upload|sign in|log in)\b/i.test(label))
    return false;
  if (
    /^(?:submit|send|finish|complete) (?:my |your |the )?(?:job )?application(?: now)?[.!]?$/i.test(
      label,
    )
  )
    return true;
  return (
    source === 'external' && /^(?:submit|send|finish|complete|apply|apply now)[.!]?$/i.test(label)
  );
}
function metadata(scope: Element, url: URL): Omit<SubmissionIntent, 'id'> {
  const root = scope.ownerDocument;
  const scopeHeading = heading(scope);
  const title = root.querySelector(
    '[data-test-job-title],.job-details-jobs-unified-top-card__job-title,.jobs-unified-top-card__job-title,h1',
  );
  let jobTitle = (title?.textContent || '').trim();
  if (!jobTitle || /^(?:apply to|review your application|job application)$/i.test(jobTitle))
    jobTitle = root.title.replace(/\s*[|–—]\s*(?:LinkedIn|careers?).*$/i, '').trim();
  const company = root.querySelector(
    '[data-test-company-name],.job-details-jobs-unified-top-card__company-name,.jobs-unified-top-card__company-name',
  );
  const applyTo = /\bapply to\s+(.+?)(?=\s+(?:review your|contact info|step \d)|$)/i.exec(
    scopeHeading,
  );
  return {
    url: url.href,
    jobTitle: jobTitle.slice(0, 250),
    company: (company?.textContent?.trim() || applyTo?.[1] || '').slice(0, 200),
    source: linkedIn(url) ? 'linkedin' : 'external',
  };
}
function scopes(root: Document): Array<Document | ShadowRoot> {
  const found: Array<Document | ShadowRoot> = [root];
  for (let index = 0; index < found.length; index++)
    for (const node of found[index].querySelectorAll('*'))
      if (node.shadowRoot && node.localName !== 'ezeapply-ai') found.push(node.shadowRoot);
  return found;
}
function successCandidates(
  root: Document,
  source: SubmissionIntent['source'],
): Map<Element, string> {
  const results = new Map<Element, string>();
  const consider = (node: Element) => {
    if (!visible(node) || excluded(node) || node.closest('input,textarea,[contenteditable="true"]'))
      return;
    const value = text(node);
    if (!value || value.length > 1200 || FAILURE.test(value)) return;
    const match =
      SUCCESS.exec(value) || (source === 'linkedin' ? LINKEDIN_SUCCESS.exec(value) : null);
    if (match) results.set(node, value);
  };
  for (const scope of scopes(root)) {
    for (const node of scope.querySelectorAll(
      'h1,h2,h3,h4,[role="heading"],[role="status"],[role="alert"],[class*="success"],[id*="success"],[id*="confirmation"],main,dialog,[role="dialog"]',
    ))
      consider(node);
    const walker = root.createTreeWalker(scope, 4);
    let node: Node | null,
      count = 0;
    while ((node = walker.nextNode()) && count++ < 6000) {
      if (
        node.parentElement &&
        (SUCCESS.test(node.textContent || '') ||
          (source === 'linkedin' && LINKEDIN_SUCCESS.test((node.textContent || '').trim())))
      )
        consider(node.parentElement);
    }
  }
  return results;
}
function relevant(node: Element, original: Element | undefined, root: Document): boolean {
  if (original?.isConnected && visible(original)) {
    if (original.contains(node)) return true;
    if (node.contains(original)) return false;
    const other = node.closest(FORM);
    if (other && !other.contains(original) && !original.contains(other))
      return node.matches('dialog,[role="dialog"]') && /application|applying/i.test(text(node));
    if (node.closest('[role="alert"],[role="status"],.artdeco-toast-item')) return true;
    const originalMain = original.closest('main,[role="main"]');
    return !!originalMain && originalMain.contains(node) && !node.closest('form,[role="form"]');
  }
  const container = node.closest('form,[role="form"]');
  // A confirmation view may replace its form; do not borrow a confirmation
  // embedded inside another still-editable application or unrelated form.
  if (
    container &&
    [...container.querySelectorAll('input:not([type="hidden"]),textarea,select')].some(visible)
  )
    return false;
  return node.ownerDocument === root;
}

/** Passive capture only. Never clicks a button, changes a form or submits data. */
export function mountSubmissionCapture(options: CaptureOptions = {}): () => void {
  const root = options.root || document;
  const currentURL = options.url || (() => new URL(root.location.href));
  if (isCommunicationPage(currentURL())) return () => {};
  let stopped = false,
    queued = false,
    busy = false,
    original: Element | undefined,
    pending: SubmissionIntent | undefined;
  let prepared = false,
    preparePromise: Promise<void> | undefined,
    startedAt = 0,
    revision = 0,
    failures = 0;
  let baseline = new Map<Element, string>();
  let retry: ReturnType<typeof setTimeout> | undefined;
  const observed = new WeakSet<Node>();
  const observer = new MutationObserver(schedule);
  const completed = new Set<string>();
  function observe() {
    for (const scope of scopes(root))
      if (!observed.has(scope)) {
        observer.observe(scope, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['open', 'hidden', 'aria-hidden', 'class', 'style'],
        });
        observed.add(scope);
      }
  }
  function prepare(scope: Element) {
    const url = currentURL();
    if (isCommunicationPage(url)) return;
    // click and submit events from the same attempt must share one ID.
    if (pending && original === scope && Date.now() - startedAt < 2000) return;
    const intent = { id: crypto.randomUUID(), ...metadata(scope, url) };
    pending = intent;
    original = scope;
    prepared = false;
    startedAt = Date.now();
    failures = 0;
    baseline = successCandidates(root, intent.source);
    const request = ++revision;
    preparePromise = chrome.runtime
      .sendMessage({ type: 'eze-tracking:prepare', intent })
      .then((result) => {
        if (stopped || request !== revision) return;
        if (!result?.ok) throw new Error('Tracking intent was not saved');
        prepared = true;
        schedule();
      })
      .catch(() => {
        if (!stopped && request === revision) {
          pending = undefined;
          prepared = false;
        }
      });
  }
  async function scan() {
    if (stopped || busy || !pending || !prepared || completed.has(pending.id)) return;
    const url = currentURL();
    if (
      isCommunicationPage(url) ||
      Date.now() - startedAt > TTL ||
      url.origin !== new URL(pending.url).origin
    )
      return;
    const evidence = [...successCandidates(root, pending.source)].find(
      ([node, value]) => baseline.get(node) !== value && relevant(node, original, root),
    );
    if (!evidence) return;
    const intent = pending,
      request = revision;
    busy = true;
    try {
      const clause = (SUCCESS.exec(evidence[1]) || LINKEDIN_SUCCESS.exec(evidence[1]))?.[0].trim();
      const result = await chrome.runtime.sendMessage({
        type: 'eze-tracking:confirm',
        intentId: intent.id,
        evidence: clause,
      });
      if (!result?.ok) throw new Error('Confirmation was not saved');
      completed.add(intent.id);
      if (request === revision) {
        pending = undefined;
        prepared = false;
      }
    } catch {
      if (!stopped && request === revision && ++failures < 4)
        retry = setTimeout(schedule, Math.min(4000, 500 * 2 ** failures));
    } finally {
      busy = false;
    }
  }
  function schedule() {
    if (stopped || queued || !pending || !prepared) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      observe();
      void scan();
    });
  }
  const click = (event: Event) => {
    if (!event.isTrusted) return;
    const target = event
      .composedPath()
      .find(
        (node) =>
          node instanceof HTMLElement &&
          node.matches('button,input[type="submit"],[role="button"]'),
      ) as HTMLElement | undefined;
    if (!target) return;
    const url = currentURL(),
      scope = submissionScope(target, url);
    if (scope && finalButton(target, linkedIn(url) ? 'linkedin' : 'external')) prepare(scope);
  };
  const submit = (event: Event) => {
    if (!event.isTrusted) return;
    const target = event.composedPath()[0];
    if (!(target instanceof HTMLElement)) return;
    const scope = submissionScope(target, currentURL());
    const submitter = (event as SubmitEvent).submitter;
    if (
      scope &&
      (!submitter || finalButton(submitter, linkedIn(currentURL()) ? 'linkedin' : 'external'))
    )
      prepare(scope);
  };
  root.addEventListener('click', click, true);
  root.addEventListener('submit', submit, true);
  const initial = revision;
  chrome.runtime
    .sendMessage({ type: 'eze-tracking:page-ready' })
    .then((result) => {
      if (stopped || revision !== initial || !result?.ok || !result.intent) return;
      const intent = result.intent as SubmissionIntent;
      if (
        typeof intent.id !== 'string' ||
        !['linkedin', 'external'].includes(intent.source) ||
        typeof intent.url !== 'string'
      )
        return;
      let url: URL;
      try {
        url = new URL(intent.url);
      } catch {
        return;
      }
      if (url.origin !== currentURL().origin) return;
      const created =
        typeof intent.createdAt === 'number'
          ? intent.createdAt
          : typeof intent.createdAt === 'string'
            ? Date.parse(intent.createdAt)
            : Date.now();
      if (!Number.isFinite(created) || Date.now() - created < 0 || Date.now() - created > TTL)
        return;
      pending = intent;
      startedAt = created;
      prepared = true;
      baseline = new Map();
      schedule();
    })
    .catch(() => {});
  const lifecycle = setInterval(schedule, 1000);
  return () => {
    stopped = true;
    revision++;
    observer.disconnect();
    clearInterval(lifecycle);
    if (retry) clearTimeout(retry);
    root.removeEventListener('click', click, true);
    root.removeEventListener('submit', submit, true);
    void preparePromise;
  };
}
