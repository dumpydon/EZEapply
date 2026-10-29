// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applicationFollowChoices,
  isLinkedInHost,
  mountLinkedInFollow,
} from '../src/linkedin-follow';
import { LINKEDIN_NOFOLLOW_KEY } from '../src/types';

type StorageListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];
let cleanup: (() => void) | undefined, data: Record<string, unknown>;
const listeners = new Set<StorageListener>();
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const review = (label = 'Follow Example Company to stay up to date with their page') =>
  `<div role="dialog" aria-label="Apply to Example Company"><h2>Review your application</h2><label><input id="follow" type="checkbox" checked>${label}</label><label><input id="consent" type="checkbox" checked>I agree to the terms</label><label><input id="answer" type="checkbox" checked>I completed the following training</label><button id="submit">Submit application</button></div>`;
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
}
function preference(value: boolean) {
  data[LINKEDIN_NOFOLLOW_KEY] = value;
  listeners.forEach((fn) => fn({ [LINKEDIN_NOFOLLOW_KEY]: { newValue: value } }, 'local'));
}
beforeEach(() => {
  vi.useFakeTimers();
  data = {};
  listeners.clear();
  document.body.innerHTML = review();
  vi.stubGlobal('location', new URL('https://www.linkedin.com/jobs/view/123'));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: vi.fn(async () => ({ ...data })) },
      onChanged: {
        addListener: (fn: StorageListener) => listeners.add(fn),
        removeListener: (fn: StorageListener) => listeners.delete(fn),
      },
    },
  });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('LinkedIn company-follow preference', () => {
  it.each([
    'Follow Example Company to stay up to date with their page',
    'Follow this company',
    'Follow our page',
    'Follow for more',
    'I would like to follow this company',
    'Do you want to follow this company?',
  ])('recognizes follow wording: %s', (label) => {
    document.body.innerHTML = review(label);
    expect(applicationFollowChoices(document).map((control) => control.id)).toEqual(['follow']);
  });
  it('starts off and only acts after an explicit saved opt-in', async () => {
    cleanup = mountLinkedInFollow();
    await settle();
    expect(input('follow').checked).toBe(true);
    const events: string[] = [];
    input('follow').addEventListener('input', () => events.push('input'));
    input('follow').addEventListener('change', () => events.push('change'));
    preference(true);
    await settle();
    expect(input('follow').checked).toBe(false);
    expect(input('consent').checked).toBe(true);
    expect(input('answer').checked).toBe(true);
    expect(events).toEqual(['input', 'change']);
    preference(false);
    input('follow').checked = true;
    document.body.append(document.createElement('span'));
    await settle();
    await vi.advanceTimersByTimeAsync(1500);
    expect(input('follow').checked).toBe(true);
  });
  it('handles newly rendered steps and native property-only rechecks independently of autofill', async () => {
    data[LINKEDIN_NOFOLLOW_KEY] = true;
    document.body.replaceChildren();
    cleanup = mountLinkedInFollow();
    await settle();
    document.body.innerHTML = review();
    await settle();
    expect(input('follow').checked).toBe(false);
    input('follow').checked = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(input('follow').checked).toBe(false);
  });
  it('handles the current LinkedIn native dialog without an explicit role or legacy modal class', async () => {
    // Sanitized structure from the live application: an implicit dialog and a
    // property-checked native input with aria-label but an empty HTML label.
    document.body.innerHTML = `<dialog open aria-labelledby="dialog-header"><h2 id="dialog-header">Apply to Example Company</h2>
      <section><h3>Review your application</h3><div><input id="review-follow" type="checkbox" aria-label="Follow Example Company to stay up to date with their page"><label for="review-follow"></label><span>Follow Example Company to stay up to date with their page</span></div></section>
      <label><input id="consent" type="checkbox" checked>I agree to the terms</label><button id="submit">Submit application</button></dialog>`;
    input('review-follow').checked = true;
    expect(applicationFollowChoices(document).map((control) => control.id)).toEqual([
      'review-follow',
    ]);
    const submit = vi.fn();
    document.getElementById('submit')!.addEventListener('click', submit);
    data[LINKEDIN_NOFOLLOW_KEY] = true;
    cleanup = mountLinkedInFollow();
    await settle();
    expect(input('review-follow').checked).toBe(false);
    expect(input('consent').checked).toBe(true);
    expect(submit).not.toHaveBeenCalled();
    input('review-follow').checked = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(input('review-follow').checked).toBe(false);
  });
  it('reacts immediately when a pre-rendered native application dialog opens', async () => {
    document.body.innerHTML = `<dialog aria-labelledby="apply-heading"><h2 id="apply-heading">Apply to Example Company</h2><label><input id="follow" type="checkbox" checked>Follow this company</label></dialog>`;
    data[LINKEDIN_NOFOLLOW_KEY] = true;
    cleanup = mountLinkedInFollow();
    await settle();
    expect(input('follow').checked).toBe(true);
    document.querySelector('dialog')!.setAttribute('open', '');
    await settle();
    expect(input('follow').checked).toBe(false);
  });
  it('handles ARIA checkboxes in newly rendered native application dialogs through their own click handler', async () => {
    document.body.replaceChildren();
    data[LINKEDIN_NOFOLLOW_KEY] = true;
    cleanup = mountLinkedInFollow();
    await settle();
    document.body.innerHTML = `<dialog open><h2>Apply to Example Company</h2><button type="button" id="custom" role="checkbox" aria-checked="true" aria-label="Follow this company"></button><label><input id="answer" type="checkbox" checked>I completed the following training</label></dialog>`;
    const custom = document.getElementById('custom')!;
    custom.addEventListener('click', () => custom.setAttribute('aria-checked', 'false'));
    await settle();
    expect(custom.getAttribute('aria-checked')).toBe('false');
    expect(input('answer').checked).toBe(true);
  });
  it('never checks an unchecked follow box or touches choices outside an application dialog', async () => {
    data[LINKEDIN_NOFOLLOW_KEY] = true;
    input('follow').checked = false;
    document.body.insertAdjacentHTML(
      'beforeend',
      '<label><input type="checkbox" id="outside" checked>Follow another page</label><div role="dialog" aria-label="Page preferences"><label><input type="checkbox" id="other-dialog" checked>Follow this company</label></div>',
    );
    const submit = vi.fn();
    document.getElementById('submit')!.addEventListener('click', submit);
    cleanup = mountLinkedInFollow();
    await settle();
    expect(input('follow').checked).toBe(false);
    expect(input('outside').checked).toBe(true);
    expect(input('other-dialog').checked).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });
  it.each([
    'I agree to follow company policies',
    'Contact me for a follow-up',
    'Do not follow this company',
    'Follow these instructions',
    'I completed the following questions',
    'Do you follow the industry news?',
  ])('preserves unrelated/negatively worded choices: %s', (label) => {
    document.body.innerHTML = review(label);
    expect(applicationFollowChoices(document)).toHaveLength(0);
  });
  it('ignores hidden, disabled and submit-capable controls while using a visible custom checkbox handler', async () => {
    document.body.innerHTML =
      review() +
      `<div class="jobs-easy-apply-modal"><form>
      <button role="checkbox" aria-checked="true" aria-label="Follow this company" id="submit-like">Follow</button>
      <div role="checkbox" aria-checked="true" aria-label="Follow our page" id="custom"></div>
      <label><input type="checkbox" checked disabled>Follow a company</label>
      <div hidden><label><input type="checkbox" id="hidden" checked>Follow a page</label></div>
    </form></div>`;
    const submit = vi.fn((event) => event.preventDefault());
    document.querySelector('form')!.addEventListener('submit', submit);
    const custom = document.getElementById('custom')!;
    custom.addEventListener('click', () => custom.setAttribute('aria-checked', 'false'));
    data[LINKEDIN_NOFOLLOW_KEY] = true;
    cleanup = mountLinkedInFollow();
    await settle();
    expect(custom.getAttribute('aria-checked')).toBe('false');
    expect(submit).not.toHaveBeenCalled();
    expect(input('hidden').checked).toBe(true);
  });
  it('does not run on other domains, including lookalike LinkedIn domains', async () => {
    for (const hostname of ['example.test', 'notlinkedin.com', 'linkedin.com.example.test'])
      expect(isLinkedInHost(hostname)).toBe(false);
    expect(isLinkedInHost('www.linkedin.com')).toBe(true);
    expect(isLinkedInHost('linkedin.com')).toBe(true);
    vi.stubGlobal('location', new URL('https://example.test/apply'));
    data[LINKEDIN_NOFOLLOW_KEY] = true;
    cleanup = mountLinkedInFollow();
    await settle();
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(input('follow').checked).toBe(true);
  });
  it('keeps newer settings when an old initial read finishes and stops after disposal', async () => {
    let finish!: (data: Record<string, unknown>) => void;
    vi.mocked(chrome.storage.local.get).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    cleanup = mountLinkedInFollow();
    preference(false);
    finish({ [LINKEDIN_NOFOLLOW_KEY]: true });
    await settle();
    expect(input('follow').checked).toBe(true);
    cleanup();
    cleanup = undefined;
    preference(true);
    document.body.append(document.createElement('span'));
    await settle();
    expect(input('follow').checked).toBe(true);
  });
  it('bounds retries when the website refuses the change, resetting the limit for a different application', async () => {
    data[LINKEDIN_NOFOLLOW_KEY] = true;
    const click = vi.spyOn(input('follow'), 'click').mockImplementation(() => {});
    cleanup = mountLinkedInFollow();
    await settle();
    await vi.advanceTimersByTimeAsync(5000);
    expect(click).toHaveBeenCalledTimes(3);
    document.querySelector('h2')!.textContent = 'Apply to Different Company';
    await settle();
    expect(click).toHaveBeenCalledTimes(4);
  });
});
