import { mountAIFieldUI, type AIField, type AIFieldUI } from './ai/field-ui';
import { matchingTerms } from './matching-terms';
import { fillNotice } from './fill-notice';
import { matchField, normalize } from './matcher';
import { getAutofillData } from './storage';
import {
  autocompleteToken,
  fieldLabels,
  fieldQuestion,
  fieldContext,
  fieldInstructions,
  ariaLabel,
  CONTROL_SELECTOR,
} from './form-labels';
import { comboboxValue, fillCombobox } from './widgets';
import { isDropdownPlaceholder, normalizeOption } from './dropdown';
import { attachResume, scanResumeInputs } from './resume';
import { mountPanelDock } from './panel-dock';
import { mountLinkedInFollow } from './linkedin-follow';
import { fieldMatchingLabels } from './field-format';
import { isApplicationField } from './application-context';
import { mountSubmissionCapture } from './submission-capture';
import {
  MESSAGE_PREFIX,
  STORAGE_KEY,
  type CustomField,
  type CustomStore,
  type FillReport,
  type Question,
} from './types';

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type FormControl = Control | HTMLElement;
interface Target {
  id: string;
  controls: FormControl[];
  autocomplete?: string;
  blocked?: string;
  labels: string[];
  kind: string;
}
interface Change {
  element: FormControl;
  before: string | boolean;
  after: string | boolean;
}
const SELECTOR = CONTROL_SELECTOR;
const UNSAFE_TYPES = new Set([
  'hidden',
  'password',
  'file',
  'submit',
  'reset',
  'button',
  'image',
  'checkbox',
  'range',
  'color',
]);
const PROTECTED =
  /\b(password|passcode|verification code|one time code|otp|captcha|social security|ssn|credit card|debit card|card number|cvv|cvc|routing number|bank account|account number|consent|agree|agreement|terms and conditions|signature)\b/i;
const identities = new WeakMap<Element, string>();
let nextIdentity = 0;
let previousChanges: Change[] = [];
// SPA form steps may reuse the same input for a different question. Scope edit
// protection to its question, rather than permanently blocking a DOM element.
const userEdited = new WeakMap<FormControl, string>();
let widgetChanges = false;
const widgetFailures = new WeakMap<HTMLElement, { value: string; until: number }>();

function identity(element: Element): string {
  let id = identities.get(element);
  if (!id) {
    id = `question-${++nextIdentity}`;
    identities.set(element, id);
  }
  return id;
}

function roots(root: Document | ShadowRoot): (Document | ShadowRoot)[] {
  const result: (Document | ShadowRoot)[] = [root];
  for (const element of root.querySelectorAll('*')) {
    if (element.shadowRoot && element.localName !== 'ezeapply-ai')
      result.push(...roots(element.shadowRoot));
  }
  return result;
}

function parentElement(element: Element): Element | null {
  return element.parentElement || (element.getRootNode() as ShadowRoot).host || null;
}
function activeControl(root: Document): Element | null {
  let active = root.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

export function isVisible(element: Element): boolean {
  if (!element.isConnected) return false;
  for (let ancestor: Element | null = element; ancestor; ancestor = parentElement(ancestor)) {
    if (
      ancestor.hasAttribute('hidden') ||
      ancestor.getAttribute('aria-hidden') === 'true' ||
      ancestor.hasAttribute('inert')
    )
      return false;
    const style = element.ownerDocument.defaultView?.getComputedStyle(ancestor);
    if (
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse'
    )
      return false;
  }
  return true;
}

function text(element: Element | null): string {
  return element?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) || '';
}

function labelledBy(element: Element): string {
  return ariaLabel(element);
}
function ownLabels(control: FormControl): string[] {
  return fieldMatchingLabels(control, fieldLabels(control)).labels;
}
function native(element: FormControl): element is Control {
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName);
}
function editable(element: FormControl): boolean {
  return (
    element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') !== 'false'
  );
}
function groupLabels(control: HTMLInputElement): string[] {
  const group = control.closest('fieldset,[role="radiogroup"]');
  if (group) {
    const legend = group.querySelector(':scope > legend');
    const values = [labelledBy(group), group.getAttribute('aria-label') || '', text(legend)];
    if (values.some(Boolean)) return [...values.filter(Boolean), control.name];
  }
  // Common ATS markup: question label and a group of individual option labels.
  const questionId = control.getAttribute('data-question-id');
  const wrapper = control.closest(
    '.form-group,.form-field,.field,.application-question,.fb-dash-form-element',
  );
  const questionLabel = wrapper?.querySelector(
    ':scope > label,:scope > legend,:scope > [class*=label]',
  );
  return [text(questionLabel || null), questionId || '', control.name].filter(Boolean);
}

function editKey(control: FormControl): string {
  const radio = control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'radio';
  return JSON.stringify([
    normalize((radio ? groupLabels(control as HTMLInputElement) : ownLabels(control))[0] || ''),
    autocompleteToken(control),
    control.getAttribute('role'),
    control.getAttribute('type'),
  ]);
}

function wasEdited(control: FormControl): boolean {
  return userEdited.get(control) === editKey(control);
}
function editingBlocks(target: Target, automatic: boolean): boolean {
  // A direct Fill this page click authorizes retrying empty fields, including
  // ones the user cleared. Background autofill must continue to respect clears.
  return automatic && target.controls.some(wasEdited);
}

function collect(root: Document): Target[] {
  const result: Target[] = [];
  for (const scope of roots(root)) {
    const controls = [...scope.querySelectorAll<FormControl>(SELECTOR)].filter((control) => {
      const type = control.tagName === 'INPUT' ? (control as HTMLInputElement).type : '';
      return (
        !control.closest('ezeapply-ai') &&
        type !== 'search' &&
        !control.closest('[role="listbox"]') &&
        !UNSAFE_TYPES.has(type) &&
        !(native(control) && control.disabled) &&
        control.getAttribute('aria-disabled') !== 'true' &&
        !(
          native(control) &&
          'readOnly' in control &&
          control.readOnly &&
          control.getAttribute('role') !== 'combobox'
        ) &&
        isVisible(control)
      );
    });
    const consumed = new Set<FormControl>();
    for (const control of controls) {
      if (consumed.has(control)) continue;
      if (control.closest('[role="combobox"]') !== control && control.closest('[role="combobox"]'))
        continue;
      const radio = control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'radio';
      let members = [control];
      const presentation = fieldMatchingLabels(control, fieldLabels(control));
      let labels = presentation.labels;
      if (
        control.getAttribute('role') === 'searchbox' ||
        control.closest('[role="search"]') ||
        /^search(?: jobs)?$/i.test(labels[0] || '')
      )
        continue;
      if (radio) {
        const form = (control as HTMLInputElement).form;
        const group = control.closest('fieldset,[role="radiogroup"]');
        members = controls.filter(
          (other) =>
            other.tagName === 'INPUT' &&
            (other as HTMLInputElement).type === 'radio' &&
            (other as HTMLInputElement).name === (control as HTMLInputElement).name &&
            (other as HTMLInputElement).form === form &&
            other.closest('fieldset,[role="radiogroup"]') === group,
        );
        labels = groupLabels(control as HTMLInputElement);
      }
      members.forEach((member) => consumed.add(member));
      if (labels.some((label) => PROTECTED.test(normalize(label)))) continue;
      const token = autocompleteToken(control);
      if (token?.match(/^(cc-|one-time-code|current-password|new-password)/)) continue;
      const context = normalize(fieldContext(control));
      const blocked =
        presentation.blocked ||
        (/\b(reference|referee|emergency contact|recruiter|recommender|previous employer|previous employment|employment history|work history|education history)\b/.test(
          context,
        )
          ? 'This field belongs to a separate person or history entry; choose the matching history entry manually'
          : undefined);
      result.push({
        id: identity(control),
        controls: members,
        labels,
        autocomplete: token,
        blocked,
        kind: radio
          ? 'radio'
          : control.tagName === 'SELECT'
            ? 'select'
            : control.getAttribute('role') === 'combobox'
              ? 'combobox'
              : editable(control)
                ? 'contenteditable'
                : control.tagName.toLowerCase(),
      });
    }
  }
  return result;
}

function placeholderOption(option: HTMLOptionElement | undefined): boolean {
  if (!option) return true;
  return !option.value.trim() || isDropdownPlaceholder(option.textContent);
}

function hasValue(target: Target): boolean {
  if (target.kind === 'combobox') return !!comboboxValue(target.controls[0]);
  if (target.kind === 'contenteditable') return !!target.controls[0].textContent?.trim();
  if (target.kind === 'radio')
    return target.controls.some((control) => (control as HTMLInputElement).checked);
  const control = target.controls[0];
  if (control.tagName === 'SELECT') {
    const select = control as HTMLSelectElement;
    if (select.multiple)
      return [...select.selectedOptions].some((option) => !placeholderOption(option));
    return !placeholderOption(select.options[select.selectedIndex]);
  }
  return native(control) && !!control.value.trim();
}

function setNative(control: FormControl, value: string | boolean): void {
  const win = control.ownerDocument.defaultView!;
  if (editable(control)) {
    control.textContent = String(value);
    control.dispatchEvent(
      new win.InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertText',
        data: String(value),
      }),
    );
    control.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
    return;
  }
  const property = typeof value === 'boolean' ? 'checked' : 'value';
  const prototype =
    control.tagName === 'SELECT'
      ? win.HTMLSelectElement.prototype
      : control.tagName === 'TEXTAREA'
        ? win.HTMLTextAreaElement.prototype
        : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, property)?.set;
  if (!setter) throw new Error('Control has no native value setter');
  setter.call(control, value);
  control.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  control.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
}

function valueOf(control: FormControl): string | boolean {
  if (editable(control)) return control.textContent || '';
  if (!native(control)) return control.textContent || '';
  return control.tagName === 'INPUT' && (control as HTMLInputElement).type === 'radio'
    ? (control as HTMLInputElement).checked
    : control.value;
}

function fillTarget(
  target: Target,
  answer: string,
  changes: Change[],
  valueAliases: string[] = [],
): string | undefined {
  if (target.kind === 'combobox') return 'Use Fill this page to select this dropdown option';
  const control = target.controls[0];
  let selected = control;
  let value: string | boolean = answer;
  if (target.kind === 'radio') {
    const matches = target.controls.filter((option) =>
      [...ownLabels(option), (option as HTMLInputElement).value].some((label) =>
        [answer, ...valueAliases].some(
          (value) => normalizeOption(label) === normalizeOption(value),
        ),
      ),
    );
    if (matches.length !== 1) return 'No unique radio option matches the saved answer';
    selected = matches[0];
    value = true;
  } else if (control.tagName === 'SELECT') {
    const select = control as HTMLSelectElement;
    if (select.multiple) return 'Multiple-choice list requires manual selection';
    const options = [...select.options].filter(
      (option) =>
        !option.disabled &&
        !option.closest('optgroup[disabled]') &&
        !placeholderOption(option) &&
        [option.value, option.textContent || ''].some((label) =>
          [answer, ...valueAliases].some(
            (value) => normalizeOption(label) === normalizeOption(value),
          ),
        ),
    );
    if (options.length !== 1) return 'No unique dropdown option matches the saved answer';
    value = options[0].value;
  } else if (native(control)) {
    const input = control as HTMLInputElement;
    if (input.type === 'number' && !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(answer.trim()))
      return 'This question needs a numeric answer; save a numeric variant';
    if (input.maxLength > -1 && answer.length > input.maxLength)
      return 'Saved answer exceeds the field length limit';
    if (input.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(answer))
      return 'Date answer must use YYYY-MM-DD';
  }
  const before = valueOf(selected);
  if (target.kind === 'radio') selected.click();
  else setNative(selected, value);
  const after = valueOf(selected);
  if (after !== value) return 'The page did not accept the saved answer';
  changes.push({ element: selected, before, after });
  return undefined;
}

function question(target: Target, fields: CustomField[], hostname: string): Question {
  const match = matchField(target.labels, fields, hostname, target.autocomplete);
  const filled = hasValue(target);
  return {
    id: target.id,
    label: target.labels[0] || target.autocomplete || 'Unlabelled question',
    kind: target.kind,
    filled,
    matchedField: match.field?.id,
    ...(aiEligible(target) ? { canDraftWithAI: true } : {}),
    reason:
      target.blocked ||
      (target.controls.some(wasEdited)
        ? filled
          ? 'Your edit was preserved'
          : 'Cleared by you; click Fill this page to refill'
        : filled
          ? 'Existing answer preserved'
          : match.reason),
  };
}

export function scanForm(
  root: Document,
  fields: CustomField[],
  hostname = root.location?.hostname || '',
): FillReport {
  const questions = collect(root).map((target) => question(target, fields, hostname));
  for (const upload of scanResumeInputs(root))
    questions.push({
      id: identity(upload.element),
      label: upload.label,
      kind: 'file',
      filled: !!upload.element.files?.length,
      reason: upload.reason || 'Use Attach resume to upload the resume saved in your profile',
    });
  return { filled: 0, skipped: questions.length, questions };
}

interface NativeAttempt {
  target: Target;
  change: Change;
  key: string;
}
function fillNativeForm(
  root: Document,
  fields: CustomField[],
  hostname: string,
  automatic: boolean,
): { report: FillReport; attempts: NativeAttempt[] } {
  const changes: Change[] = [];
  const attempts: NativeAttempt[] = [];
  const report: FillReport = { filled: 0, skipped: 0, questions: [] };
  for (const target of collect(root)) {
    const item = question(target, fields, hostname);
    const focused = automatic && target.controls.some((control) => control === activeControl(root));
    const application =
      !automatic || target.controls.some((control) => isApplicationField(control));
    if (
      application &&
      !focused &&
      !target.blocked &&
      !item.filled &&
      item.matchedField &&
      !editingBlocks(target, automatic)
    ) {
      const field = fields.find((candidate) => candidate.id === item.matchedField)!;
      try {
        const key = editKey(target.controls[0]);
        const error = fillTarget(target, field.value, changes, field.valueAliases);
        item.reason = error || 'Filled from saved field';
        if (!error) {
          item.filled = true;
          report.filled++;
          target.controls.forEach((control) => userEdited.delete(control));
          const change = changes[changes.length - 1];
          attempts.push({ target, change, key });
        }
      } catch {
        item.reason = 'The page rejected this answer';
      }
    }
    if (item.reason !== 'Filled from saved field') report.skipped++;
    report.questions.push(item);
  }
  // Preserve the previous useful undo batch when dynamic observation finds nothing new.
  if (changes.length) previousChanges.push(...changes);
  return { report, attempts };
}

export function fillForm(
  root: Document,
  fields: CustomField[],
  hostname = root.location?.hostname || '',
  automatic = false,
): FillReport {
  return fillNativeForm(root, fields, hostname, automatic).report;
}

/** Runs option widgets sequentially so one open menu never steals another's
 * result. Each adapter requires a linked popup and an exact, unique option. */
export async function fillFormWithWidgets(
  root: Document,
  fields: CustomField[],
  hostname = root.location?.hostname || '',
  automatic = false,
  signal?: AbortSignal,
): Promise<FillReport> {
  if (signal?.aborted) return { filled: 0, skipped: 0, questions: [] };
  const { report, attempts } = fillNativeForm(root, fields, hostname, automatic);
  let attempted = 0;
  for (const target of collect(root).filter((target) => target.kind === 'combobox')) {
    if (signal?.aborted) break;
    if (++attempted > 20) {
      (report.warnings ||= []).push(
        'Additional dropdowns remain. Run Fill again after reviewing this step.',
      );
      break;
    }
    const item = report.questions.find((question) => question.id === target.id)!;
    const control = target.controls[0];
    if (automatic && !target.controls.some((control) => isApplicationField(control))) continue;
    if (
      !item ||
      item.filled ||
      !item.matchedField ||
      target.blocked ||
      hasValue(target) ||
      editingBlocks(target, automatic)
    )
      continue;
    if (automatic && (activeControl(root) === control || control.contains(activeControl(root))))
      continue;
    const field = fields.find((field) => field.id === item.matchedField)!;
    const failed = widgetFailures.get(control);
    if (automatic && failed?.value === field.value && failed.until > Date.now()) continue;
    const result = await fillCombobox(control, field.value, field.valueAliases, signal);
    item.reason = result.reason;
    if (result.filled) {
      item.filled = true;
      report.filled++;
      report.skipped--;
      widgetChanges = true;
      target.controls.forEach((control) => userEdited.delete(control));
    } else if (!signal?.aborted)
      widgetFailures.set(control, { value: field.value, until: Date.now() + 30000 });
  }
  // Let framework state settle, then expose rejected values rather than claiming
  // they were accepted merely because an input briefly contained text.
  await new Promise((resolve) => root.defaultView!.setTimeout(resolve, 0));
  for (const { target, change, key } of attempts) {
    const item = report.questions.find((question) => question.id === target.id)!;
    if (
      !change.element.isConnected ||
      editKey(change.element) !== key ||
      valueOf(change.element) !== change.after
    ) {
      item.filled = false;
      item.reason = target.controls.some(wasEdited)
        ? 'Your edit was preserved'
        : !change.element.isConnected || editKey(change.element) !== key
          ? 'The form step changed before this answer could be verified; try again'
          : hasValue(target)
            ? 'The page changed this answer; review it in the form'
            : 'The page reset this answer; use its own control';
      report.filled--;
      report.skipped++;
    }
  }
  return report;
}

/** Reuse the same discovery and safe native setter for reviewed AI drafts. */
function aiEligible(target: Target): boolean {
  if (target.blocked || !['textarea', 'input', 'contenteditable'].includes(target.kind))
    return false;
  const control = target.controls[0],
    label = target.labels[0] || '';
  if (!isApplicationField(control)) return false;
  if (
    !fieldQuestion(control) ||
    !label ||
    (control.tagName === 'INPUT' && !['text', ''].includes((control as HTMLInputElement).type))
  )
    return false;
  const token = autocompleteToken(control);
  if (
    (token && /^(?:tel(?:-|$)|email$)/.test(token)) ||
    /^(?:tel|numeric|decimal)$/.test(control.getAttribute('inputmode') || '')
  )
    return false;
  const terms = matchingTerms(label);
  const normalized = normalize(label);
  const narrative =
    /\b(describe|explain|summarize|outline|scenario)\b|\btell (?:us|me) about\b|\b(?:why|how did|how would|what did|hardest problem)\b/i.test(
      label,
    );
  if (
    !narrative &&
    (terms.topic ||
      /\b(email|e mail|phone|telephone|mobile|cell|cellular|whats ?app|address|date|birth|age|gender|ethnicity|disability|veteran)\b|\bcontact (?:number|no)\b|\b(?:first|last|middle|full|legal|given|family|preferred) name\b|^(?:what is your |your )?name$/.test(
        normalized,
      ))
  )
    return false;
  return true;
}
export function aiFields(root: Document = document): AIField[] {
  return collect(root)
    .filter(aiEligible)
    .map((target) => ({
      element: target.controls[0] as AIField['element'],
      question: target.labels[0] || '',
      value: String(valueOf(target.controls[0])),
      instructions: fieldInstructions(target.controls[0]),
      maxLength:
        'maxLength' in target.controls[0] ? (target.controls[0] as HTMLInputElement).maxLength : 0,
    }))
    .filter((field) => !!field.question);
}
export function applyAIAnswer(field: AIField, answer: string, baseline: string): void {
  const current = aiFields(field.element.ownerDocument).find(
    (item) => item.element === field.element,
  );
  if (!current)
    throw new Error('This question is no longer editable. Reopen it on the current form step.');
  if (normalize(current.question) !== normalize(field.question))
    throw new Error(
      'This form question changed while you were drafting. Reopen AI for the current question.',
    );
  if (current.value !== baseline)
    throw new Error(
      'This field changed while you were drafting. Close this preview and reopen it to keep your latest edits.',
    );
  if (current.maxLength > 0 && answer.length > current.maxLength)
    throw new Error('This answer exceeds the field’s character limit.');
  const before = valueOf(field.element);
  setNative(field.element, answer);
  previousChanges.push({ element: field.element, before, after: answer });
}

export function undoFill(): FillReport {
  let filled = 0;
  let skipped = 0;
  for (const change of previousChanges.reverse()) {
    if (change.element.isConnected && valueOf(change.element) === change.after) {
      setNative(change.element, change.before);
      filled++;
    } else skipped++;
  }
  previousChanges = [];
  const warnings = widgetChanges
    ? [
        'Dropdown selections use the website’s own controls and must be changed there. Resume uploads are not removed by Undo.',
      ]
    : undefined;
  widgetChanges = false;
  return { filled, skipped, questions: [], ...(warnings ? { warnings } : {}) };
}

export function isJobContext(root: Document): boolean {
  const actual = new URL(root.location.href);
  const url =
    !/^https?:$/.test(actual.protocol) && /^https?:/.test(root.referrer || '')
      ? new URL(root.referrer)
      : actual;
  if (/(^|\.)(linkedin\.com)$/.test(url.hostname)) {
    return !![...root.querySelectorAll('dialog,[role="dialog"],.jobs-easy-apply-modal')].find(
      (dialog) =>
        /easy apply|apply to|application/i.test(
          `${dialog.getAttribute('aria-label') || ''} ${(dialog.textContent || '').slice(0, 6000)}`,
        ) && isVisible(dialog),
    );
  }
  return (
    /(^|[./_-])(careers?|jobs?|apply|applications?)([./_?=-]|$)/i.test(
      `${url.hostname}${url.pathname}`,
    ) ||
    /(^|\.)(myworkdayjobs\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|icims\.com|smartrecruiters\.com|successfactors\.com|taleo\.net|breezy\.hr|recruitee\.com|personio\.(com|de)|jobvite\.com|applytojob\.com|bamboohr\.com|teamtailor\.com|pinpointhq\.com|oraclecloud\.com|avature\.net)$/.test(
      url.hostname,
    ) ||
    [...root.querySelectorAll('form,dialog,[role=dialog]')].some((form) => {
      if (!isVisible(form)) return false;
      const inputs = form.querySelectorAll('input,textarea,select');
      const description = (form.textContent || '').slice(0, 12000);
      return (
        inputs.length >= 3 &&
        (/apply for|job application|candidate information|submit application|upload (?:(?:your|new) )?(resume|cv)/i.test(
          description,
        ) ||
          (/\bapply to\b/i.test(description) && /\b(resume|cv)\b/i.test(description)))
      );
    })
  );
}

/** AI is available only for eligible fields belonging to an application. */
export function isAIFormContext(root: Document): boolean {
  return aiFields(root).length > 0;
}

/** Entry point is gated so unit tests can import the pure DOM helpers. */
export function startContent(aiUI?: Pick<AIFieldUI, 'open'>): () => void {
  const notice = fillNotice(document);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let autoPaused = false;
  let stopped = false;
  let pendingSince = 0;
  let operation = Promise.resolve<unknown>(undefined);
  let automaticRun: AbortController | undefined;
  let activeProfileId = 'local';
  const observed = new WeakSet<Node>();
  const observer = new MutationObserver(() => schedule());
  function observeRoots(): void {
    for (const scope of roots(document)) {
      if (!observed.has(scope)) {
        observer.observe(scope, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: [
            'open',
            'hidden',
            'aria-hidden',
            'disabled',
            'class',
            'style',
            'aria-label',
            'aria-labelledby',
            'aria-describedby',
            'data-unit',
            'data-prefix',
            'data-suffix',
          ],
        });
        observed.add(scope);
      }
    }
  }
  async function execute(type: string): Promise<FillReport> {
    if (type === `${MESSAGE_PREFIX}undo`) {
      autoPaused = true;
      return undoFill();
    }
    const run = type === 'auto' ? new AbortController() : undefined;
    if (run) automaticRun = run;
    const settings = await getAutofillData();
    activeProfileId = settings.profileId || 'local';
    if (type === `${MESSAGE_PREFIX}scan`) return scanForm(document, settings.fields);
    if (type === `${MESSAGE_PREFIX}attach-resume`) {
      if (!settings.resume)
        return {
          filled: 0,
          skipped: 0,
          questions: [],
          error: 'Save a resume in your profile first.',
        };
      return attachResume(document, settings.resume);
    }
    if (type === `${MESSAGE_PREFIX}fill`) {
      autoPaused = false;
      notice.show('Autofill in progress…', true);
      try {
        const report = await fillFormWithWidgets(document, settings.fields);
        notice.show(
          report.filled
            ? `Autofill complete · ${report.filled} ${report.filled === 1 ? 'field' : 'fields'}`
            : 'Autofill complete · review remaining questions',
        );
        return report;
      } catch (error) {
        notice.dispose();
        throw error;
      }
    }
    if (!settings.autoFill || autoPaused || run?.signal.aborted)
      return { filled: 0, skipped: 0, questions: [] };
    // The same per-field application policy used by AI also excludes chat,
    // search and unrelated forms beside an application. It covers application
    // steps on generic form hosts without relying on a careers URL alone.
    return fillFormWithWidgets(
      document,
      settings.fields,
      document.location.hostname,
      true,
      run?.signal,
    );
  }
  function queued(type: string): Promise<FillReport> {
    const next = operation
      .catch(() => {})
      .then(() => (stopped ? { filled: 0, skipped: 0, questions: [] } : execute(type)));
    operation = next;
    return next;
  }
  function schedule(): void {
    if (stopped || autoPaused) return;
    if (!pendingSince) pendingSince = Date.now();
    clearTimeout(timer);
    timer = setTimeout(
      async () => {
        if (busy) {
          schedule();
          return;
        }
        pendingSince = 0;
        busy = true;
        try {
          observeRoots();
          const report = await queued('auto');
          if (report.filled) {
            notice.show(
              `Autofill complete · ${report.filled} ${report.filled === 1 ? 'field' : 'fields'}`,
            );
            await chrome.runtime.sendMessage({ type: `${MESSAGE_PREFIX}report`, report });
          }
        } catch {
          // Extension reload invalidates old content-script contexts; stop observing that page.
          if (!chrome.runtime?.id) {
            stopped = true;
            observer.disconnect();
          }
        } finally {
          busy = false;
        }
      },
      Math.max(0, Math.min(400, 1500 - (Date.now() - pendingSince))),
    );
  }
  const onMessage: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (
    message: unknown,
    _sender,
    sendResponse,
  ) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return;
    const type = (message as { type: unknown }).type;
    if (type === `${MESSAGE_PREFIX}identify`) {
      chrome.runtime.sendMessage({ type: `${MESSAGE_PREFIX}ready` }).then(
        () => sendResponse({ ready: true }),
        () => sendResponse({ ready: false }),
      );
      return true;
    }
    if (type === `${MESSAGE_PREFIX}open-ai`) {
      const request = message as { questionId?: unknown; questionLabel?: unknown };
      const target = collect(document).find((target) => target.id === request.questionId);
      if (
        !target ||
        typeof request.questionLabel !== 'string' ||
        normalize(target.labels[0] || '') !== normalize(request.questionLabel) ||
        !aiEligible(target) ||
        !aiUI
      ) {
        sendResponse({
          error:
            'This question changed or is no longer editable. Find questions again on the current form step.',
        });
        return;
      }
      aiUI.open(target.controls[0]).then(
        (opened) =>
          sendResponse(
            opened
              ? { ok: true }
              : { error: 'This question is no longer available for AI drafting.' },
          ),
        (error) =>
          sendResponse({
            error: error instanceof Error ? error.message : 'Could not open the AI draft.',
          }),
      );
      return true;
    }
    if (
      typeof type !== 'string' ||
      !['scan', 'fill', 'undo', 'attach-resume'].some(
        (action) => type === `${MESSAGE_PREFIX}${action}`,
      )
    )
      return;
    automaticRun?.abort();
    queued(type)
      .then((report) => {
        sendResponse(report);
        return chrome.runtime.sendMessage({ type: `${MESSAGE_PREFIX}report`, report });
      })
      .catch(() =>
        sendResponse({
          filled: 0,
          skipped: 0,
          questions: [],
          error: 'Custom fields could not be loaded; refresh this page.',
        }),
      );
    return true;
  };
  chrome.runtime.onMessage.addListener(onMessage);
  // Remember actual typing, including intentional deletion, so a later dynamic
  // update cannot put an answer back after the user has cleared it.
  const onUserEdit = (event: Event) => {
    const target = event.composedPath()[0];
    if (event.isTrusted && target instanceof Element) {
      const control = target.closest<FormControl>(SELECTOR);
      if (!control) return;
      userEdited.set(control, editKey(control));
      const combobox = control.closest<HTMLElement>('[role="combobox"]');
      if (combobox) userEdited.set(combobox, editKey(combobox));
    }
  };
  const onStorage: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area !== 'local') return;
    if (
      changes[STORAGE_KEY] ||
      changes.profile ||
      changes.lastSyncProfile ||
      changes.autofillEnabled
    ) {
      automaticRun?.abort();
      const before = changes[STORAGE_KEY]?.oldValue as CustomStore | undefined;
      const after = changes[STORAGE_KEY]?.newValue as CustomStore | undefined;
      // Undo pauses the current page. Explicitly switching auto-fill off/on or
      // choosing another profile resumes it; unrelated saves do not undo Undo.
      if (
        changes.lastSyncProfile ||
        changes.autofillEnabled?.newValue === true ||
        (before?.profiles?.[activeProfileId]?.autoFill === false &&
          after?.profiles?.[activeProfileId]?.autoFill === true)
      )
        autoPaused = false;
    }
    schedule();
  };
  let lastUrl = location.href;
  let lastShadowCount = roots(document).length;
  const onNavigation = () => {
    autoPaused = false;
    schedule();
  };
  // pushState does not emit popstate; newly attached shadow roots also do not
  // necessarily mutate light DOM. Poll only these cheap lifecycle signals.
  const lifecycle = setInterval(() => {
    if (stopped || document.visibilityState === 'hidden') return;
    const nextUrl = location.href;
    const shadowCount = roots(document).length;
    if (nextUrl !== lastUrl || shadowCount !== lastShadowCount) {
      lastUrl = nextUrl;
      lastShadowCount = shadowCount;
      onNavigation();
    }
  }, 1500);
  document.addEventListener('input', onUserEdit, true);
  document.addEventListener('change', onUserEdit, true);
  chrome.storage.onChanged.addListener(onStorage);
  window.addEventListener('popstate', onNavigation);
  chrome.runtime.sendMessage({ type: `${MESSAGE_PREFIX}ready` }).catch(() => {});
  observeRoots();
  schedule();
  return () => {
    stopped = true;
    notice.dispose();
    automaticRun?.abort();
    clearTimeout(timer);
    clearInterval(lifecycle);
    observer.disconnect();
    chrome.runtime.onMessage.removeListener(onMessage);
    chrome.storage.onChanged.removeListener(onStorage);
    document.removeEventListener('input', onUserEdit, true);
    document.removeEventListener('change', onUserEdit, true);
    window.removeEventListener('popstate', onNavigation);
  };
}

const contentScope = globalThis as typeof globalThis & { __ezeContentStarted?: boolean };
if (
  typeof chrome !== 'undefined' &&
  chrome.runtime?.id &&
  typeof document !== 'undefined' &&
  !contentScope.__ezeContentStarted
) {
  contentScope.__ezeContentStarted = true;
  // Remove the retired 1.4.0 overlay if this bundle reconnects an older tab.
  document.getElementById('ezeapply-overlay')?.remove();
  mountPanelDock();
  mountLinkedInFollow();
  mountSubmissionCapture();
  const aiUI = mountAIFieldUI({
    fields: () => aiFields(),
    enabled: () => isAIFormContext(document),
    apply: applyAIAnswer,
  });
  startContent(aiUI);
}
