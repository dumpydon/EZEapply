import { composedParent, fieldLabels } from './form-labels';
import { normalize } from './matching-text';

const APPLICATION_ID =
  /\b(?:job application|employment application|candidate application|internship application|candidate form|hiring form|recruitment form)\b/;
const APPLICATION_TEXT =
  /\b(?:job application|employment application|candidate application|internship application|candidate information|applicant details|review your application|submit (?:your )?application|cover letter)\b/i;
const APPLICATION_HEADING =
  /\b(?:job|employment|internship|recruitment|hiring) (?:application|form|questionnaire)\b|\b(?:engineer|engineering|developer|designer|analyst|intern|scientist|manager|specialist|associate)\b.{0,80}\bapplication (?:form|questionnaire)\b/i;
const APPLICATION_ACTION = /\b(?:apply (?:to|for)|application for|application form|apply form)\b/i;
const JOB_QUESTION =
  /\b(?:this (?:job|role|position)|ctc|notice period|work authorization|visa sponsorship|professional experience|work experience|linkedin profile)\b/i;
const RESUME = /\b(?:resume|cv)\b|résumé/i;
const APPLICATION_ROUTE =
  /(?:^|\/)(?:apply|application|applications|candidatev?\d*|candidate-application)(?:[\/._-]|$)/i;
const CAREER_ROUTE = /(?:^|[./_-])(?:careers?|jobs?|recruitment)(?:[./_-]|$)/i;
const ATS_HOST =
  /(?:^|\.)(?:myworkdayjobs\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|icims\.com|smartrecruiters\.com|successfactors\.com|taleo\.net|breezy\.hr|recruitee\.com|personio\.(?:com|de)|jobvite\.com|applytojob\.com|bamboohr\.com|teamtailor\.com|pinpointhq\.com|oraclecloud\.com|avature\.net|darwinbox\.(?:in|com))$/i;
const COMMUNICATION =
  /\b(?:chat|chatbox|messaging|conversation|conversations|composer|compose|reply|replies|comment|comments|newsletter|subscribe|subscription|feedback|search)\b/;
const OTHER_FORM =
  /\b(?:contact us|contact form|support form|send (?:us )?a message|newsletter|subscribe|feedback|search|sign in|log in)\b/i;
const FORM_SCOPE = 'form,[role="form"]';
const DIALOG_SCOPE = 'dialog,[role="dialog"],.jobs-easy-apply-modal';

function visible(element: Element): boolean {
  if (!element.isConnected) return false;
  for (let node: Element | null = element; node; node = composedParent(node)) {
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
  return true;
}
function effectiveURL(root: Document): URL {
  const url = new URL(root.location?.href || 'about:blank');
  return /^about:(?:blank|srcdoc)$/.test(url.href) && /^https?:/.test(root.referrer || '')
    ? new URL(root.referrer)
    : url;
}
const hostIs = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

/** Communication services must not become applicant forms because an email or
 * conversation happens to mention hiring, a résumé, or an application. */
export function isCommunicationPage(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (
    [
      'mail.google.com',
      'outlook.live.com',
      'outlook.office.com',
      'outlook.office365.com',
      'mail.yahoo.com',
      'web.whatsapp.com',
      'web.telegram.org',
      'teams.microsoft.com',
      'teams.live.com',
      'messenger.com',
    ].some((domain) => hostIs(host, domain))
  )
    return true;
  if (hostIs(host, 'discord.com') || hostIs(host, 'discordapp.com') || hostIs(host, 'slack.com'))
    return !CAREER_ROUTE.test(url.pathname);
  return false;
}

function metadata(element: Element): string {
  return normalize(
    [
      element.id,
      element.getAttribute('class'),
      element.getAttribute('name'),
      element.getAttribute('data-testid'),
      element.getAttribute('data-automation-id'),
    ]
      .filter(Boolean)
      .join(' '),
  );
}
function heading(scope: Element): string {
  return [
    scope.getAttribute('aria-label') || '',
    ...(scope.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => scope.ownerDocument.getElementById(id)?.textContent || ''),
    ...[...scope.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')]
      .filter(visible)
      .slice(0, 12)
      .map((node) => node.textContent || ''),
  ]
    .join(' ')
    .slice(0, 2500);
}
function scopeText(scope: Element): string {
  // textContent joins adjacent block elements without a space ("ResumeWhy").
  // Read separate text nodes so application evidence survives common ATS markup.
  const walker = scope.ownerDocument.createTreeWalker(scope, 4);
  let text = '',
    node: Node | null;
  while ((node = walker.nextNode()) && text.length < 16000) {
    if (node.parentElement?.closest('script,style,template,[hidden],[aria-hidden="true"]'))
      continue;
    text += ` ${node.textContent || ''}`;
  }
  return text.slice(0, 16000);
}
function communicationField(control: HTMLElement): boolean {
  if (control.matches('input[type="search"],[role="searchbox"]')) return true;
  const labels = fieldLabels(control).slice(0, 3).map(normalize);
  if (
    labels.some((label) =>
      /^(?:search\b|message\b|reply\b|comment$|write (?:a |your )?(?:message|reply|comment)|type (?:a |your )?message)/.test(
        label,
      ),
    )
  )
    return true;
  for (
    let node: Element | null = control;
    node && !node.matches('body,html');
    node = composedParent(node)
  ) {
    if (
      node.matches(
        'nav,header,footer,[role="navigation"],[role="search"],[role="log"],[role="feed"]',
      )
    )
      return true;
    if (COMMUNICATION.test(metadata(node))) return true;
    // A surrounding application form need not inherit a page-wide chat class.
    if (node !== control && node.matches(FORM_SCOPE)) break;
  }
  return false;
}

function applicationScope(scope: Element, url: URL): boolean {
  if (!visible(scope) || COMMUNICATION.test(metadata(scope))) return false;
  const title = heading(scope),
    identity = metadata(scope),
    body = scopeText(scope);
  if (hostIs(url.hostname, 'linkedin.com'))
    return (
      scope.matches('.jobs-easy-apply-modal') ||
      (scope.matches('dialog,[role="dialog"]') &&
        /\b(?:apply to|easy apply|review your application)\b/i.test(title))
    );
  if (OTHER_FORM.test(title)) return false;
  if (
    APPLICATION_ID.test(identity) ||
    APPLICATION_ID.test(normalize(title)) ||
    APPLICATION_TEXT.test(title) ||
    APPLICATION_HEADING.test(title)
  )
    return true;
  const resume = RESUME.test(body);
  const careerSite =
    ATS_HOST.test(url.hostname) || CAREER_ROUTE.test(`${url.hostname}${url.pathname}`);
  if (
    APPLICATION_ACTION.test(`${title} ${identity}`) &&
    (resume || careerSite || JOB_QUESTION.test(body))
  )
    return true;
  if (
    resume &&
    (/\bapply (?:to|for)\b/i.test(title) ||
      APPLICATION_TEXT.test(body) ||
      /\bupload (?:your |new )?(?:resume|cv)\b/i.test(body))
  )
    return true;
  // Job-site identity helps only within a structured application form with
  // applicant evidence. A careers URL alone never enables every text box.
  return (
    scope.matches(FORM_SCOPE) &&
    careerSite &&
    (resume || APPLICATION_TEXT.test(body) || JOB_QUESTION.test(body))
  );
}

/** One policy for inline buttons, sidebar actions and applying a reviewed draft.
 * A URL may be supplied by callers inspecting a separately identified document. */
export function isApplicationField(
  control: HTMLElement,
  url = effectiveURL(control.ownerDocument),
): boolean {
  if (isCommunicationPage(url) || !visible(control) || communicationField(control)) return false;
  const scopes: Element[] = [];
  for (
    let node: Element | null = composedParent(control);
    node && !node.matches('body,html');
    node = composedParent(node)
  ) {
    if (node.matches(`${FORM_SCOPE},${DIALOG_SCOPE},main,[role="main"]`)) scopes.push(node);
  }
  const form = scopes.find((scope) => scope.matches(FORM_SCOPE));
  if (form && OTHER_FORM.test(`${heading(form)} ${metadata(form)}`)) return false;
  // Do not borrow the résumé or application heading from a different form on
  // the same page (for example a contact form beside an application).
  const localScopes = scopes.filter(
    (scope) =>
      !form ||
      scope === form ||
      [...scope.querySelectorAll(FORM_SCOPE)].every((candidate) => candidate === form),
  );
  if (localScopes.some((scope) => applicationScope(scope, url))) return true;
  if (hostIs(url.hostname, 'linkedin.com')) return false;
  // Some ATS steps render controls without a form element. Require an explicit
  // application route/title and a single form. Generic forms, job searches,
  // and unrelated sibling forms never qualify just because a form exists.
  const root = control.ownerDocument;
  const soleForm =
    !form || [...root.querySelectorAll(FORM_SCOPE)].every((candidate) => candidate === form);
  const jobApplicationRoute =
    APPLICATION_ROUTE.test(url.pathname) &&
    (ATS_HOST.test(url.hostname) || CAREER_ROUTE.test(`${url.hostname}${url.pathname}`));
  return (
    soleForm &&
    (jobApplicationRoute ||
      APPLICATION_ID.test(normalize(root.title)) ||
      APPLICATION_HEADING.test(root.title))
  );
}
