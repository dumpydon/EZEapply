import type { Draft } from './generation';
import { fits } from './generation';

export interface AIField {
  element: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  question: string;
  value: string;
  maxLength: number;
  instructions?: string;
}
export interface AIFieldIntegration {
  fields(): AIField[];
  enabled(): boolean;
  apply(field: AIField, value: string, baseline: string): void;
}
export interface AIFieldUI {
  /** Opens a review dialog only; generation still requires a separate user click. */
  open(element: HTMLElement): Promise<boolean>;
  dispose(): void;
}
const css = `
:host{all:initial!important;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;color:#edf8f5!important}
*{box-sizing:border-box}[hidden]{display:none!important}button,input,textarea{font:inherit}button{cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid #61d4be;outline-offset:2px}
.pill{position:fixed;z-index:2147483646;display:flex;align-items:center;justify-content:center;gap:4px;border:1px solid #38978377;background:#effffb;color:#146a58;padding:3px 7px;height:24px;min-height:0;border-radius:7px;box-shadow:0 2px 6px #0002;font:600 11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap}.pill:hover{background:#dcf7ef}.pill[hidden]{display:none}.ai-logo{display:block;width:14px;height:14px;flex:none;object-fit:contain}.dialog-logo{width:22px;height:22px}
dialog{background:#25342f;color:#edf8f5;border:1px solid #526a61;border-radius:16px;padding:16px;width:min(460px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;box-shadow:0 18px 80px #0008;margin:auto}dialog::backdrop{background:#0b151bc4;backdrop-filter:blur(3px)}
header,.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}h2{margin:0;font-size:18px;flex:1}p{margin:10px 0}label{display:block;margin:12px 0 5px;font-weight:600}textarea{display:block;width:100%;resize:vertical;background:#18251f;color:#f0f8f4;border:1px solid #527569;border-radius:9px;padding:10px;min-height:80px}textarea.answer{min-height:130px}
button{border:1px solid #66827680;background:#ffffff0b;color:inherit;border-radius:8px;padding:7px 10px}button:hover{background:#ffffff14}.primary{background:linear-gradient(115deg,#167f70,#359d72);border-color:#63ba9f;color:white}.muted{color:#b0c5bc;font-size:12px}.error{color:#ffb8bb}.actions{margin-top:14px}.actions .spacer{flex:1}.count{font-size:11px;text-align:right;color:#b0c5bc}.question{padding-bottom:12px;border-bottom:1px solid #ffffff20;font-weight:550}small{display:block}.mode{display:flex;align-items:center;gap:8px;font-weight:400}input{accent-color:#299d80}.extra{border:1px solid #52756977;border-radius:9px;padding:9px 11px;margin-top:12px}.extra summary{cursor:pointer;color:#b0c5bc;font-size:12px}.context-ready{background:#299d801a;border:1px solid #48b79d66;border-radius:9px;padding:10px 12px;color:#b4e5d5;font-size:12px}
`;
export function mountAIFieldUI(integration: AIFieldIntegration): AIFieldUI {
  const host = document.createElement('ezeapply-ai');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = css;
  shadow.append(style);
  function logo(dialog = false): HTMLImageElement {
    const image = document.createElement('img');
    image.className = `ai-logo${dialog ? ' dialog-logo' : ''}`;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    const url =
      typeof chrome !== 'undefined' ? chrome.runtime?.getURL?.('custom/ai-logo.png') : undefined;
    if (url) image.src = url;
    image.addEventListener('error', () => {
      image.hidden = true;
    });
    return image;
  }
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'pill';
  pill.append(logo(), document.createTextNode('EZE AI'));
  pill.title = 'Draft an application answer';
  pill.hidden = true;
  shadow.append(pill);
  document.documentElement.append(host);
  let target: AIField | undefined,
    dialog: HTMLDialogElement | undefined,
    id = '',
    stopped = false;
  let refreshCurrent: (() => Promise<void>) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined, port: chrome.runtime.Port | undefined;
  function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') {
    const element = document.createElement(tag);
    element.className = cls;
    element.textContent = text;
    return element;
  }
  function button(label: string, cls = '') {
    const el = node('button', cls, label);
    el.type = 'button';
    return el;
  }
  function stopRequest() {
    if (id) void chrome.runtime.sendMessage({ type: 'eze-ai:cancel', id }).catch(() => {});
    id = '';
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
    port?.disconnect();
    port = undefined;
  }
  function currentField(field: AIField): AIField | undefined {
    if (!field.element.isConnected || !integration.enabled()) return;
    return integration
      .fields()
      .find((item) => item.element === field.element && item.question === field.question);
  }
  function close() {
    stopRequest();
    refreshCurrent = undefined;
    dialog?.close();
    dialog?.remove();
    dialog = undefined;
    if (target && currentField(target)) target.element.focus();
  }
  function position() {
    if (!target || !currentField(target)) {
      target = undefined;
      pill.hidden = true;
      if (dialog) close();
      return;
    }
    const rect = target.element.getBoundingClientRect();
    pill.hidden =
      rect.width < 20 || rect.height < 10 || rect.bottom < 0 || rect.top > innerHeight || !!dialog;
    if (pill.hidden) return;
    const width = pill.offsetWidth || 76,
      height = pill.offsetHeight || 24,
      gap = 4;
    const left = Math.max(gap, Math.min(rect.left + rect.width - width, innerWidth - width - gap));
    let top = rect.bottom + gap;
    if (top + height > innerHeight - gap) top = rect.top - height - gap;
    // Keep the action outside the answer area. If neither edge has room in the
    // viewport, wait for scrolling rather than covering the user's text.
    if (top < gap) {
      pill.hidden = true;
      return;
    }
    pill.style.left = `${left}px`;
    pill.style.top = `${top}px`;
  }
  function focus(event: FocusEvent) {
    if (dialog || event.composedPath().includes(host)) return;
    if (!integration.enabled()) {
      target = undefined;
      pill.hidden = true;
      return;
    }
    const element = event.composedPath()[0];
    const match = integration.fields().find((field) => field.element === element);
    if (match) {
      target = match;
      position();
    } else {
      target = undefined;
      pill.hidden = true;
    }
  }
  async function open() {
    if (!target || dialog) return false;
    const field = currentField(target);
    if (!field) {
      target = undefined;
      pill.hidden = true;
      return false;
    }
    const baseline = field.value;
    dialog = node('dialog');
    dialog.setAttribute('aria-label', 'EZEapply AI answer');
    shadow.append(dialog);
    const currentDialog = dialog;
    const header = node('header'),
      title = node('h2', '', 'EZE AI'),
      dismiss = button('Close');
    header.append(logo(true), title, dismiss);
    const question = node('p', 'question', field.question);
    if (field.instructions) question.append(node('small', 'muted', field.instructions));
    const summary = node('p', 'muted', 'Checking your AI setup…');
    const backgroundHint = node('p', 'context-ready', 'Checking saved résumé/background…');
    const mode = node('label', 'mode'),
      smart = node('input');
    smart.type = 'checkbox';
    mode.append(smart, 'Smart model');
    const contextLabel = node('label', '', 'Additional context (optional)'),
      context = node('textarea');
    context.id = 'context';
    context.maxLength = 8000;
    context.placeholder = 'Add facts that help answer this question.';
    contextLabel.htmlFor = context.id;
    const extras = node('details', 'extra'),
      extraToggle = node('summary', '', 'Add question-specific facts (optional)');
    extras.append(extraToggle, contextLabel, context);
    const status = node('p', 'muted');
    status.setAttribute('role', 'status');
    const answerLabel = node('label', '', 'Review your answer'),
      answer = node('textarea', 'answer');
    answer.id = 'draft';
    answerLabel.htmlFor = answer.id;
    answer.hidden = answerLabel.hidden = true;
    const count = node('div', 'count');
    const actions = node('div', 'actions'),
      settings = button('AI settings'),
      spacer = node('span', 'spacer'),
      generate = button('Generate', 'primary'),
      cancel = button('Cancel'),
      use = button('Use answer', 'primary');
    cancel.hidden = true;
    use.hidden = true;
    actions.append(settings, spacer, cancel, generate, use);
    currentDialog.append(
      header,
      question,
      summary,
      backgroundHint,
      mode,
      extras,
      answerLabel,
      answer,
      count,
      status,
      actions,
    );
    let draft: Draft | undefined;
    let ready = false,
      version = 0,
      backgroundIncluded = false;
    generate.disabled = true;
    function updateCount() {
      count.textContent = draft
        ? `${answer.value.length} / ${draft.maxLength} characters${draft.maxWords ? ` · ${answer.value.trim().split(/\s+/).filter(Boolean).length} / ${draft.maxWords} words` : ''}`
        : '';
      use.disabled =
        !draft || !answer.value.trim() || !fits(answer.value, draft.maxLength, draft.maxWords);
    }
    const report = (text: string, error = false) => {
      status.textContent = text;
      status.classList.toggle('error', error);
    };
    dismiss.addEventListener('click', close);
    currentDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    settings.addEventListener('click', () => {
      void chrome.runtime.sendMessage({ type: 'eze-ai:open-settings' });
    });
    answer.addEventListener('input', updateCount);
    cancel.addEventListener('click', () => {
      stopRequest();
      generate.disabled = !ready;
      generate.hidden = false;
      cancel.hidden = true;
      report('Cancelled. Your form answer is unchanged.');
    });
    generate.addEventListener('click', async (event) => {
      if (!event.isTrusted || id || !ready) return;
      if (!currentField(field)) {
        target = undefined;
        close();
        return;
      }
      id = crypto.randomUUID();
      const requestId = id;
      generate.disabled = true;
      use.hidden = true;
      cancel.hidden = false;
      report('Generating with your provider…');
      try {
        port = chrome.runtime.connect({ name: 'eze-ai:keepalive' });
        port.postMessage({ id: requestId });
        heartbeat = setInterval(() => {
          try {
            port?.postMessage({ ping: true });
          } catch {
            stopRequest();
          }
        }, 20000);
        const description = document.querySelector(
          '.jobs-description,[data-testid="job-description"],#job-description,[itemprop="description"]',
        );
        const response = await chrome.runtime.sendMessage({
          type: 'eze-ai:generate',
          id: requestId,
          request: {
            question: [field.question, field.instructions].filter(Boolean).join('\n'),
            context: context.value,
            pageTitle: document.title,
            jobDescription: description?.textContent?.slice(0, 8000) || '',
            maxLength: field.maxLength,
            tier: smart.checked ? 'smart' : 'fast',
          },
        });
        if (id !== requestId || dialog !== currentDialog) return;
        if (response?.error) throw new Error(response.error);
        draft = response.draft as Draft;
        if (!draft || typeof draft.answer !== 'string') throw new Error('No answer was returned.');
        if (draft.needsInfo) {
          report(
            `${backgroundIncluded ? 'Your saved résumé/background was included. ' : ''}${draft.needsInfo}`,
            true,
          );
          answer.hidden = answerLabel.hidden = true;
          count.textContent = '';
          extras.open = true;
          context.focus();
        } else {
          answer.value = draft.answer;
          answer.hidden = answerLabel.hidden = false;
          use.hidden = false;
          report(
            draft.warning ||
              `Drafted with ${draft.provider} · ${draft.model}. Review before using.`,
            !!draft.warning,
          );
          updateCount();
        }
        generate.textContent = 'Regenerate';
      } catch (error) {
        if (id === requestId && dialog === currentDialog)
          report(error instanceof Error ? error.message : 'Generation failed.', true);
      } finally {
        if (id === requestId) {
          id = '';
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = undefined;
          port?.disconnect();
          port = undefined;
          generate.disabled = !ready;
          cancel.hidden = true;
        }
      }
    });
    use.addEventListener('click', (event) => {
      if (
        !event.isTrusted ||
        !draft ||
        !fits(answer.value, draft.maxLength, draft.maxWords) ||
        !answer.value.trim()
      )
        return;
      if (!currentField(field)) {
        target = undefined;
        close();
        return;
      }
      try {
        integration.apply(field, answer.value.trim(), baseline);
        close();
      } catch (error) {
        report(error instanceof Error ? error.message : 'Could not apply this answer.', true);
      }
    });
    let initialized = false;
    refreshCurrent = async () => {
      const requested = ++version;
      try {
        const info = await chrome.runtime.sendMessage({
          type: 'eze-ai:status',
          ...(initialized ? { tier: smart.checked ? 'smart' : 'fast' } : {}),
        });
        if (dialog !== currentDialog || version !== requested) return;
        if (info?.error) throw new Error(info.error);
        if (!info || typeof info.configured !== 'boolean')
          throw new Error('Could not read AI setup. Open AI settings, then return here.');
        if (!initialized) smart.checked = !!info.smart;
        initialized = true;
        ready = info.configured;
        generate.disabled = !!id || !ready;
        summary.textContent = ready
          ? `Your provider: ${info.provider} · ${info.model}`
          : info.issue ||
            'Add your provider key and model in AI settings. Your résumé does not replace provider setup.';
        summary.classList.toggle('error', !ready);
        backgroundIncluded = !!info.hasBackground;
        backgroundHint.textContent = backgroundIncluded
          ? `Saved résumé/background${info.backgroundCharacters ? ` · ${Number(info.backgroundCharacters).toLocaleString()} characters` : ''} · included automatically. You can generate without adding extra context.`
          : info.includeProfile
            ? 'Saved profile and custom answers are included. To add résumé text once: AI settings → Answers → Use saved résumé or Load PDF / text.'
            : 'No saved résumé/background is available. Add it once in AI settings → Answers → Use saved résumé or Load PDF / text.';
      } catch (error) {
        if (dialog === currentDialog && version === requested) {
          ready = false;
          generate.disabled = true;
          report(error instanceof Error ? error.message : 'Could not check AI setup.', true);
        }
      }
    };
    smart.addEventListener('change', () => void refreshCurrent?.());
    currentDialog.showModal();
    pill.hidden = true;
    await refreshCurrent();
    if (dialog === currentDialog) (ready ? generate : settings).focus();
    return dialog === currentDialog;
  }
  pill.addEventListener('click', (event) => {
    if (event.isTrusted) void open();
  });
  document.addEventListener('focusin', focus, true);
  target = integration.enabled()
    ? integration.fields().find((field) => field.element === document.activeElement)
    : undefined;
  position();
  window.addEventListener('scroll', position, true);
  window.addEventListener('resize', position);
  const timer = setInterval(() => {
    if (!stopped) position();
  }, 1000);
  const onWindowFocus = () => {
    if (dialog && !id) void refreshCurrent?.();
  };
  window.addEventListener('focus', onWindowFocus);
  return {
    async open(element) {
      if (stopped || !integration.enabled()) return false;
      if (dialog)
        throw new Error(
          'An AI draft is already open on this page. Close it before opening another question.',
        );
      const field = integration.fields().find((field) => field.element === element);
      if (!field) return false;
      target = field;
      return open();
    },
    dispose() {
      stopped = true;
      close();
      clearInterval(timer);
      document.removeEventListener('focusin', focus, true);
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('focus', onWindowFocus);
      host.remove();
    },
  };
}
