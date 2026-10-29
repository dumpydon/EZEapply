// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mountSubmissionCapture,
  submissionScope,
  type SubmissionIntent,
} from '../src/submission-capture';

const external = 'https://careers.example.test/apply/engineer';
const linkedin = 'https://www.linkedin.com/jobs/view/123456';
type Listener = (event: Event) => void;
let cleanup: (() => void) | undefined,
  listeners: Record<string, Listener>,
  send: ReturnType<typeof vi.fn>;
let readyIntent: SubmissionIntent | undefined;
const formHTML =
  '<main><h1>Engineer job application</h1><form aria-label="Job application"><label>First name<input></label><p>Upload your resume</p><button type="button">Review</button><button type="submit">Submit application</button></form></main>';
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
function capture(url = external) {
  const spy = vi.spyOn(document, 'addEventListener');
  cleanup = mountSubmissionCapture({ url: () => new URL(url) });
  listeners = Object.fromEntries(
    spy.mock.calls
      .filter(([type]) => type === 'click' || type === 'submit')
      .map(([type, listener]) => [type, listener as Listener]),
  );
}
function trustedClick(button: HTMLElement) {
  listeners.click({
    isTrusted: true,
    composedPath: () => [button, ...parents(button)],
  } as unknown as Event);
}
function parents(node: Element): Element[] {
  return node.parentElement ? [node.parentElement, ...parents(node.parentElement)] : [];
}
function submitButton() {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent === 'Submit application',
  )!;
}
function showSuccess(
  message = 'Your application has been submitted successfully.',
  parent: Element = document.querySelector('form')!,
) {
  const node = document.createElement('p');
  node.setAttribute('role', 'status');
  node.textContent = message;
  parent.append(node);
  return node;
}
const confirmations = () =>
  send.mock.calls.filter(([message]) => message.type === 'eze-tracking:confirm');

beforeEach(() => {
  vi.useFakeTimers();
  readyIntent = undefined;
  document.title = 'Engineer job application';
  document.body.innerHTML = formHTML;
  send = vi.fn(async (message: { type: string; intent?: SubmissionIntent }) =>
    message.type === 'eze-tracking:page-ready'
      ? { ok: true, intent: readyIntent }
      : message.type === 'eze-tracking:prepare'
        ? { ok: true, intent: message.intent }
        : { ok: true, record: { id: 'record' } },
  );
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});
describe('passive confirmed application capture', () => {
  it('arms a final application action and counts only a new positive confirmation once', async () => {
    capture();
    trustedClick(submitButton());
    await settle();
    expect(confirmations()).toHaveLength(0);
    const prepared = send.mock.calls.find(
      ([message]) => message.type === 'eze-tracking:prepare',
    )![0];
    expect(prepared.intent).toMatchObject({
      source: 'external',
      url: external,
      jobTitle: 'Engineer job application',
    });
    showSuccess();
    await settle();
    expect(confirmations()).toHaveLength(1);
    expect(confirmations()[0][0]).toMatchObject({
      intentId: prepared.intent.id,
      evidence: 'Your application has been submitted',
    });
    document.body.append(document.createElement('span'));
    await vi.advanceTimersByTimeAsync(2500);
    expect(confirmations()).toHaveLength(1);
  });
  it('tracks LinkedIn Easy Apply native dialogs and their new Application sent view', async () => {
    document.body.innerHTML =
      '<h1>Research Engineer</h1><dialog open><h2>Apply to Example Company</h2><p>Review your application</p><button type="button">Submit application</button></dialog>';
    capture(linkedin);
    trustedClick(submitButton());
    await settle();
    document.querySelector('dialog')!.remove();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<dialog open><h2>Application sent</h2><p>Your application was sent to Example Company.</p><button>Done</button></dialog>',
    );
    await settle();
    expect(confirmations()).toHaveLength(1);
    expect(
      send.mock.calls.find(([message]) => message.type === 'eze-tracking:prepare')![0].intent,
    ).toMatchObject({
      source: 'linkedin',
      company: 'Example Company',
      jobTitle: 'Research Engineer',
    });
  });
  it('does not count Next, Review, Save, initial Apply or closing a dialog', async () => {
    document.body.innerHTML =
      '<dialog open><h2>Apply to Example</h2><button>Next</button><button>Review</button><button>Save application</button><button>Apply</button><button>Submit application</button></dialog>';
    capture(linkedin);
    for (const button of [...document.querySelectorAll('button')].slice(0, 4)) trustedClick(button);
    await settle();
    expect(
      send.mock.calls.filter(([message]) => message.type === 'eze-tracking:prepare'),
    ).toHaveLength(0);
    trustedClick(submitButton());
    await settle();
    document.querySelector('dialog')!.remove();
    await vi.advanceTimersByTimeAsync(2000);
    expect(confirmations()).toHaveLength(0);
  });
  it('does not count validation errors, failure wording or already-applied notices', async () => {
    capture();
    trustedClick(submitButton());
    await settle();
    const notice = showSuccess(
      'Unable to submit your application. Please fix the required fields.',
    );
    await settle();
    expect(confirmations()).toHaveLength(0);
    notice.textContent = 'Your application has not been submitted.';
    await settle();
    expect(confirmations()).toHaveLength(0);
    notice.textContent = 'You already submitted your application.';
    await settle();
    expect(confirmations()).toHaveLength(0);
  });
  it('ignores pre-existing confirmations and unrelated success in a sibling form or chat', async () => {
    const old = showSuccess();
    capture();
    trustedClick(submitButton());
    await settle();
    expect(confirmations()).toHaveLength(0);
    const form = document.createElement('form');
    form.setAttribute('aria-label', 'Contact us');
    document.querySelector('main')!.append(form);
    showSuccess(undefined, form);
    const chat = document.createElement('div');
    chat.className = 'chat-composer';
    document.body.append(chat);
    showSuccess(undefined, chat);
    old.setAttribute('data-other-update', 'changed');
    await vi.advanceTimersByTimeAsync(2000);
    expect(confirmations()).toHaveLength(0);
  });
  it('does not prepare tracking on Gmail, job searches, newsletters, or contact forms', async () => {
    for (const url of ['https://mail.google.com/mail/u/0/', external]) {
      document.title = 'Contact us';
      document.body.innerHTML =
        '<main><h1>Contact us</h1><form aria-label="Contact us"><input><button type="submit">Submit application</button></form></main>';
      expect(submissionScope(submitButton(), new URL(url))).toBeUndefined();
    }
    document.title = 'Job search';
    document.body.innerHTML =
      '<form role="search"><input type="search"><button type="submit">Submit application</button></form>';
    expect(submissionScope(submitButton(), new URL(external))).toBeUndefined();
  });
  it('waits for the background prepare acknowledgement before confirming an immediate success', async () => {
    let finish: (value: unknown) => void = () => {};
    send.mockImplementation(async (message: { type: string }) =>
      message.type === 'eze-tracking:prepare'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : { ok: true },
    );
    capture();
    trustedClick(submitButton());
    showSuccess();
    await settle();
    expect(confirmations()).toHaveLength(0);
    finish({ ok: true });
    await settle();
    expect(confirmations()).toHaveLength(1);
  });
  it('restores a pending application across navigation and confirms the new thank-you page', async () => {
    readyIntent = {
      id: 'pending-record',
      url: external,
      jobTitle: 'Engineer',
      company: 'Example',
      source: 'external',
      createdAt: Date.now() - 2000,
    };
    document.title = 'Thank you';
    document.body.innerHTML =
      '<main><h1>Thank you for applying!</h1><p>We have received your application.</p></main>';
    capture('https://careers.example.test/thank-you');
    await settle();
    expect(confirmations()).toHaveLength(1);
    expect(confirmations()[0][0].intentId).toBe('pending-record');
  });
  it('does not restore expired or cross-origin pending intents', async () => {
    readyIntent = {
      id: 'old',
      url: external,
      jobTitle: 'Engineer',
      company: 'Example',
      source: 'external',
      createdAt: Date.now() - 31 * 60 * 1000,
    };
    document.body.innerHTML = '<main><h1>Thank you for applying!</h1></main>';
    capture();
    await settle();
    expect(confirmations()).toHaveLength(0);
    cleanup?.();
    readyIntent = { ...readyIntent, createdAt: Date.now(), url: 'https://another.example/apply' };
    capture();
    await settle();
    expect(confirmations()).toHaveLength(0);
  });
  it('handles a job application’s native submit event without relying on a button click', async () => {
    capture();
    const form = document.querySelector('form')!;
    listeners.submit({
      isTrusted: true,
      composedPath: () => [form, ...parents(form)],
      submitter: null,
    } as unknown as SubmitEvent);
    await settle();
    showSuccess('Your response has been recorded.');
    await settle();
    expect(confirmations()).toHaveLength(1);
  });
  it('retries a rejected confirmation without preparing another application or double counting', async () => {
    let attempts = 0;
    send.mockImplementation(async (message: { type: string }) =>
      message.type === 'eze-tracking:confirm' && ++attempts === 1
        ? { error: 'Temporarily unavailable' }
        : { ok: true },
    );
    capture();
    trustedClick(submitButton());
    await settle();
    showSuccess();
    await settle();
    expect(confirmations()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1200);
    expect(confirmations()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(5000);
    expect(confirmations()).toHaveLength(2);
    expect(
      send.mock.calls.filter(([message]) => message.type === 'eze-tracking:prepare'),
    ).toHaveLength(1);
  });
  it('keeps a delayed startup response from replacing a newer submission intent', async () => {
    let finish: (value: unknown) => void = () => {};
    send.mockImplementation(async (message: { type: string }) =>
      message.type === 'eze-tracking:page-ready'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : { ok: true },
    );
    capture();
    trustedClick(submitButton());
    await settle();
    finish({
      ok: true,
      intent: { id: 'stale', url: external, source: 'external', jobTitle: 'Old' },
    });
    showSuccess();
    await settle();
    expect(confirmations()).toHaveLength(1);
    expect(confirmations()[0][0].intentId).not.toBe('stale');
  });
  it.each([
    'Application submitted successfully',
    'We have received your application',
    'Thank you for applying!',
  ])('recognizes a final external confirmation: %s', async (message) => {
    capture();
    trustedClick(submitButton());
    await settle();
    showSuccess(message);
    await settle();
    expect(confirmations()).toHaveLength(1);
  });
  it('saves only the confirmation clause, without surrounding applicant answers or page text', async () => {
    capture();
    trustedClick(submitButton());
    await settle();
    showSuccess(
      'Private applicant details. Your application has been submitted successfully. More private details.',
    );
    await settle();
    expect(confirmations()[0][0].evidence).toBe('Your application has been submitted');
  });
  it('restores ISO timestamps from the real worker and refuses expired ones', async () => {
    readyIntent = {
      id: 'pending-record',
      url: external,
      jobTitle: 'Engineer',
      company: 'Example',
      source: 'external',
      createdAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    };
    document.body.innerHTML = '<main><h1>Thank you for applying!</h1></main>';
    capture();
    await settle();
    expect(confirmations()).toHaveLength(0);
  });
  it('does not count success-like wording within a failed submission notice', async () => {
    capture();
    trustedClick(submitButton());
    await settle();
    showSuccess('Your application cannot be submitted.');
    await settle();
    expect(confirmations()).toHaveLength(0);
  });
});
