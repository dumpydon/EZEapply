import { LINKEDIN_NOFOLLOW_KEY } from './types';
import { ariaLabel } from './form-labels';
import { normalize as normalizeFollowLabel } from './matching-text';

// A native <dialog> has implicit dialog semantics and need not carry a role.
// LinkedIn's newer application UI uses it instead of the legacy modal class.
const APPLICATION_DIALOG_SELECTOR = 'dialog,.jobs-easy-apply-modal,[role="dialog"]';

function visible(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (
      node.hasAttribute('hidden') ||
      node.hasAttribute('inert') ||
      node.getAttribute('aria-hidden') === 'true'
    )
      return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse'
    )
      return false;
  }
  return element.isConnected;
}
function checked(element: HTMLElement): boolean {
  return element.tagName === 'INPUT'
    ? (element as HTMLInputElement).checked
    : element.getAttribute('aria-checked') === 'true';
}

/** Discovery is separate from clicking so unsupported/ambiguous controls stay
 * unchanged. The caller gates production use to linkedin.com and saved opt-in. */
export function applicationFollowChoices(root: Document): HTMLElement[] {
  const result = new Set<HTMLElement>();
  for (const dialog of root.querySelectorAll<HTMLElement>(APPLICATION_DIALOG_SELECTOR)) {
    if (!visible(dialog)) continue;
    const description = `${ariaLabel(dialog)} ${dialog.getAttribute('aria-label') || ''} ${(dialog.textContent || '').slice(0, 16000)}`;
    if (
      !dialog.matches('.jobs-easy-apply-modal') &&
      !/\b(?:apply to|easy apply|review your application|job application|submit application)\b/i.test(
        description,
      )
    )
      continue;
    for (const control of dialog.querySelectorAll<HTMLElement>(
      'input[type="checkbox"],[role="checkbox"]',
    )) {
      if (
        !checked(control) ||
        control.hasAttribute('disabled') ||
        control.closest('[aria-disabled="true"],fieldset[disabled]')
      )
        continue;
      if (
        (control.tagName === 'A' && control.hasAttribute('href')) ||
        (control.tagName === 'BUTTON' &&
          (control as HTMLButtonElement).form &&
          (control as HTMLButtonElement).type !== 'button')
      )
        continue;
      const labels =
        control.tagName === 'INPUT'
          ? [...((control as HTMLInputElement).labels || [])]
          : [...root.querySelectorAll('label[for]')].filter(
              (label) => !!control.id && label.getAttribute('for') === control.id,
            );
      const enclosing = control.closest('label');
      if (enclosing && !labels.includes(enclosing)) labels.push(enclosing);
      if (!visible(control) && !labels.some(visible)) continue;
      const label = normalizeFollowLabel(
        [
          ariaLabel(control),
          control.getAttribute('aria-label') || '',
          ...labels.map((label) => label.textContent || ''),
        ].join(' '),
      );
      const knownIdentity = [control.id, control.getAttribute('name') || ''].some((value) =>
        /^follow company(?: checkbox)?$/.test(normalizeFollowLabel(value)),
      );
      if (!/\bfollow\b/.test(label) && !knownIdentity) continue;
      // "following questions", consent to follow rules, follow-up emails and
      // negatively worded opt-outs are not requests to follow a company page.
      if (
        /\b(?:agree|consent|terms|privacy|polic(?:y|ies)|rules|instructions|guidelines|practices|certify|attest|follow up|unfollow|do not follow|don t follow|stop following|disable follow)\b/.test(
          label,
        )
      )
        continue;
      const offer = /\b(?:do you want to|would you like to|opt in to) follow\b/.test(label);
      if (
        !offer &&
        /^(?:do|does|did|have|has|are|is|which|what|how|when|why|can|could|will)\b/.test(label)
      )
        continue;
      result.add(control);
    }
  }
  return [...result];
}

export function isLinkedInHost(hostname: string): boolean {
  return hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com');
}

/** Independent of saved-answer autofill and AI; never clicks Next/Submit. */
export function mountLinkedInFollow(): () => void {
  if (!isLinkedInHost(location.hostname)) return () => {};
  let stopped = false,
    enabled = false,
    revision = 0,
    queued = false,
    poll: ReturnType<typeof setInterval> | undefined;
  const attempts = new WeakMap<HTMLElement, { count: number; until: number; question: string }>();
  function scan() {
    if (stopped || !enabled || document.visibilityState === 'hidden') return;
    for (const control of applicationFollowChoices(document)) {
      const dialog = control.closest(APPLICATION_DIALOG_SELECTOR);
      const question = normalizeFollowLabel(
        `${ariaLabel(control)} ${control.getAttribute('aria-label') || ''} ${control.closest('label')?.textContent || ''} ${control.tagName === 'INPUT' ? [...((control as HTMLInputElement).labels || [])].map((label) => label.textContent).join(' ') : ''} ${dialog?.getAttribute('aria-label') || ''} ${dialog?.querySelector('h2,[role="heading"]')?.textContent || ''}`,
      );
      const now = Date.now(),
        previous = attempts.get(control),
        count =
          previous && previous.until > now && previous.question === question ? previous.count : 0;
      if (count >= 3) continue;
      attempts.set(control, { count: count + 1, until: now + 30000, question });
      // Native click invokes the website's own input/change and framework
      // handlers. Never fabricate a checked attribute or toggle an unchecked box.
      try {
        control.click();
      } catch {
        /* A rejected control is left to the user. */
      }
    }
  }
  function schedule() {
    if (stopped || !enabled || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      scan();
    });
  }
  const observer = new MutationObserver(schedule);
  function watch() {
    observer.disconnect();
    if (poll) clearInterval(poll);
    poll = undefined;
    if (!stopped && enabled) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          'open',
          'checked',
          'aria-checked',
          'aria-label',
          'aria-labelledby',
          'hidden',
          'aria-hidden',
          'disabled',
          'class',
          'style',
        ],
      });
      // Some frameworks change only the native checked property; no DOM
      // mutation is emitted. This also catches a property-only recheck.
      poll = setInterval(scan, 1000);
      scan();
    }
  }
  const changed: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (stopped || area !== 'local' || !changes[LINKEDIN_NOFOLLOW_KEY]) return;
    revision++;
    enabled = changes[LINKEDIN_NOFOLLOW_KEY].newValue === true;
    watch();
  };
  chrome.storage.onChanged.addListener(changed);
  const initial = revision;
  chrome.storage.local
    .get(LINKEDIN_NOFOLLOW_KEY)
    .then((data) => {
      if (stopped || revision !== initial) return;
      enabled = data[LINKEDIN_NOFOLLOW_KEY] === true;
      watch();
    })
    .catch(() => {});
  document.addEventListener('change', schedule, true);
  document.addEventListener('visibilitychange', schedule);
  return () => {
    stopped = true;
    observer.disconnect();
    if (poll) clearInterval(poll);
    chrome.storage.onChanged.removeListener(changed);
    document.removeEventListener('change', schedule, true);
    document.removeEventListener('visibilitychange', schedule);
  };
}
