// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { isApplicationField } from '../src/application-context';

afterEach(() => {
  document.body.replaceChildren();
  document.title = '';
});
const input = '<label>Describe your experience<textarea id="answer"></textarea></label>';
function allowed(html: string, url: string): boolean {
  document.body.innerHTML = html;
  return isApplicationField(document.querySelector<HTMLElement>('#answer')!, new URL(url));
}

describe('application-only AI context', () => {
  it.each([
    ['Discord', 'https://discord.com/channels/@me/123'],
    ['Gmail', 'https://mail.google.com/mail/u/0/#inbox'],
    ['Outlook', 'https://outlook.office.com/mail/inbox'],
    ['Slack', 'https://workspace.slack.com/client/T/C'],
    ['Messenger', 'https://www.messenger.com/t/example'],
  ])('rejects %s even when a conversation contains job/application evidence', (_, url) => {
    document.title = 'Job application';
    expect(
      allowed(
        `<main><form id="job-application"><h1>Job application</h1><p>Resume · Submit application</p>${input}</form></main>`,
        url,
      ),
    ).toBe(false);
  });
  it.each([
    ['an ordinary form', `<form>${input}</form>`],
    [
      'a generic Google Forms survey',
      `<form><div role="heading">Customer survey</div>${input}</form>`,
    ],
    [
      'a chat composer',
      `<div class="chat-composer"><div contenteditable="true" role="textbox" aria-label="Message @Example" id="answer"></div></div>`,
    ],
    [
      'a reply editor',
      `<form><div contenteditable="true" aria-label="Message body" id="answer"></div></form>`,
    ],
    ['a search box', `<form role="search"><input id="answer" aria-label="Search products"></form>`],
    [
      'a social post',
      `<main><form><textarea id="answer" aria-label="Write a post"></textarea></form></main>`,
    ],
    ['a contact form', `<form><h1>Contact us</h1>${input}</form>`],
  ])('rejects %s without recruiting context', (_, html) => {
    expect(allowed(html, 'https://example.com/')).toBe(false);
  });
  it.each([
    [
      'an ATS application',
      `<form><p>Your résumé</p>${input}</form>`,
      'https://jobs.lever.co/example/123',
    ],
    [
      'an employer application',
      `<form id="job-application">${input}</form>`,
      'https://example.com/opportunities/123',
    ],
    [
      'a generic-route application modal',
      `<article role="dialog" aria-label="Apply to Example Engineer"><p>Upload New Resume</p><form>${input}</form></article>`,
      'https://platform.example.com/talent/all-opportunities',
    ],
    [
      'a Google Forms application',
      `<form><div role="heading">Software Engineer application form</div>${input}</form>`,
      'https://docs.google.com/forms/d/e/123/viewform',
    ],
    [
      'a LinkedIn native application dialog',
      `<dialog open aria-label="Apply to Example"><form>${input}</form></dialog>`,
      'https://www.linkedin.com/jobs/search/',
    ],
    [
      'a LinkedIn legacy application modal',
      `<section class="jobs-easy-apply-modal">${input}</section>`,
      'https://www.linkedin.com/jobs/view/123',
    ],
    ['an ATS step without a form element', `${input}`, 'https://careers.example.com/apply/123'],
  ])('supports %s', (_, html, url) => {
    expect(allowed(html, url)).toBe(true);
  });
  it.each([
    ['chat', `<aside class="chat-widget">${input}</aside>`],
    [
      'email',
      `<form aria-label="Reply"><div contenteditable="true" id="answer" aria-label="Message body"></div></form>`,
    ],
    ['contact', `<form id="contact-form"><h2>Contact us</h2>${input}</form>`],
    [
      'search',
      `<div role="search"><textarea aria-label="Search jobs" id="answer"></textarea></div>`,
    ],
  ])('excludes a %s widget beside a real application on the same careers page', (_, widget) => {
    document.title = 'Job application';
    expect(
      allowed(
        `<main><h1>Job application</h1><form id="job-application"><label>Cover letter<textarea></textarea></label></form>${widget}</main>`,
        'https://example.com/careers/apply',
      ),
    ).toBe(false);
  });
  it('does not borrow application evidence from a sibling form', () => {
    document.title = 'Job application';
    expect(
      allowed(
        `<main><form id="job-application"><h1>Job application</h1><label>Cover letter<textarea></textarea></label></form><form>${input}</form></main>`,
        'https://example.com/careers/apply',
      ),
    ).toBe(false);
  });
  it('allows the application but excludes LinkedIn messaging while that dialog is open', () => {
    const url = new URL('https://www.linkedin.com/jobs/view/123');
    document.body.innerHTML = `<dialog open aria-label="Apply to Example"><label>Describe a project<textarea id="application"></textarea></label></dialog><section class="msg-overlay-conversation-bubble"><div contenteditable="true" role="textbox" aria-label="Write a message" id="message"></div></section>`;
    expect(isApplicationField(document.querySelector<HTMLElement>('#application')!, url)).toBe(
      true,
    );
    expect(isApplicationField(document.querySelector<HTMLElement>('#message')!, url)).toBe(false);
  });
  it('supports an application control inside an open shadow root', () => {
    document.body.innerHTML = '<form id="job-application"><app-field></app-field></form>';
    const shadow = document.querySelector('app-field')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = input;
    expect(
      isApplicationField(
        shadow.querySelector<HTMLElement>('#answer')!,
        new URL('https://example.com/'),
      ),
    ).toBe(true);
  });
  it('does not accept a hidden application or a careers URL alone', () => {
    expect(
      allowed(
        `<div role="dialog" hidden aria-label="Job application">${input}</div>`,
        'https://example.com/careers',
      ),
    ).toBe(false);
    expect(allowed(`<form>${input}</form>`, 'https://example.com/careers')).toBe(false);
  });
  it.each([
    ['a generic apply URL', 'https://example.com/apply', 'Apply online'],
    ['a loan application', 'https://example.com/apply/loan', 'Application for a personal loan'],
    [
      'an ordinary application form',
      'https://docs.google.com/forms/d/e/123/viewform',
      'Application form',
    ],
  ])('requires job evidence beyond %s', (_, url, title) => {
    document.title = title;
    expect(allowed(`<form><h1>${title}</h1>${input}</form>`, url)).toBe(false);
  });
  it('rechecks reused controls when a SPA changes from an application to a chat', () => {
    document.body.innerHTML = `<form id="job-application">${input}</form>`;
    const control = document.querySelector<HTMLElement>('#answer')!,
      form = document.querySelector('form')!,
      url = new URL('https://example.com/');
    expect(isApplicationField(control, url)).toBe(true);
    form.id = 'message-composer';
    expect(isApplicationField(control, url)).toBe(false);
  });
});
