// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.linkedin.com/jobs/view/123"}
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fillForm, fillFormWithWidgets, scanForm, undoFill } from '../src/content';

const enabled = { defaultYes: true };
function radio(id: string, style = '', extra = ''): string {
  return `<fieldset class="fb-dash-form-element"><legend id="${id}-question">Have you worked with this platform?</legend>
    <div class="fb-text-selectable__option"><input type="radio" id="${id}-yes" name="urn:li:fsd_formElement:${id}" value="Yes" style="${style}" ${extra}>
      <label for="${id}-yes">Yes</label></div>
    <div class="fb-text-selectable__option"><input type="radio" id="${id}-no" name="urn:li:fsd_formElement:${id}" value="No" style="${style}" ${extra}>
      <label for="${id}-no">No</label></div></fieldset>`;
}
function application(html: string): void {
  document.body.innerHTML = `<div role="dialog" class="jobs-easy-apply-modal" aria-label="Apply to Example"><form>${html}</form></div>`;
}
function input(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}
beforeEach(() => document.body.replaceChildren());
afterEach(() => {
  undoFill();
  document.body.replaceChildren();
});

describe('rendered application radio choices', () => {
  it.each(['display:none', 'visibility:hidden'])(
    'uses the visible associated label when only the native input has %s',
    async (style) => {
      application(radio('payments', style) + radio('rag', style));
      const changed: string[] = [];
      input('payments-yes').addEventListener('change', () => changed.push('payments'));
      expect(scanForm(document, []).questions).toHaveLength(2);
      const report = await fillFormWithWidgets(document, [], '', true, undefined, enabled);
      expect(report.filled).toBe(2);
      expect(input('payments-yes').checked).toBe(true);
      expect(input('rag-yes').checked).toBe(true);
      expect(changed).toEqual(['payments']);
      expect(undoFill().filled).toBe(2);
      expect(input('payments-yes').checked).toBe(false);
    },
  );
  it('reads the option label separately from a shared question in aria-labelledby', () => {
    application(radio('question'));
    for (const choice of ['yes', 'no']) {
      const label = document.querySelector<HTMLLabelElement>(`label[for="question-${choice}"]`)!;
      label.id = `label-${choice}`;
      input(`question-${choice}`).setAttribute(
        'aria-labelledby',
        `question-question label-${choice}`,
      );
    }
    expect(fillForm(document, [], '', true, enabled).filled).toBe(1);
    expect(input('question-yes').checked).toBe(true);
  });
  it('supports option names supplied only through aria-label', () => {
    application(`<fieldset><legend>Ready for this role?</legend>
      <input id="native-yes" type="radio" name="native" value="Y" aria-label="Yes">
      <input type="radio" name="native" value="N" aria-label="No"></fieldset>
      <div role="radiogroup" aria-label="Ready for onboarding?">
      <button type="button" id="custom-yes" role="radio" aria-checked="false" aria-label="Yes"></button>
      <button type="button" role="radio" aria-checked="false" aria-label="No"></button></div>`);
    const custom = document.getElementById('custom-yes')!;
    custom.addEventListener('click', () => custom.setAttribute('aria-checked', 'true'));
    expect(fillForm(document, [], '', true, enabled).filled).toBe(2);
    expect(input('native-yes').checked).toBe(true);
    expect(custom.getAttribute('aria-checked')).toBe('true');
  });
  it('counts an ARIA wrapper and its backing native input as one option', () => {
    application(`<fieldset><legend>Comfortable working with this team?</legend>
      <label role="radio"><input id="wrapped-yes" type="radio" name="wrapped" value="Yes" style="display:none">Yes</label>
      <label role="radio"><input type="radio" name="wrapped" value="No" style="display:none">No</label></fieldset>`);
    expect(scanForm(document, []).questions).toHaveLength(1);
    expect(fillForm(document, [], '', true, enabled).filled).toBe(1);
    expect(input('wrapped-yes').checked).toBe(true);
    expect(undoFill().filled).toBe(1);
  });
  it('uses the visible label’s normal click path for a controlled radio', () => {
    application(radio('controlled'));
    const label = document.querySelector<HTMLLabelElement>('label[for="controlled-yes"]')!;
    let committed = false;
    label.addEventListener('click', () => {
      committed = true;
    });
    input('controlled-yes').addEventListener('change', () => {
      if (!committed) input('controlled-yes').checked = false;
    });
    expect(fillForm(document, [], '', true, enabled).filled).toBe(1);
    expect(committed).toBe(true);
    expect(input('controlled-yes').checked).toBe(true);
  });
  it('preserves an existing No through a visually replaced native input', () => {
    application(radio('chosen', 'display:none'));
    input('chosen-no').checked = true;
    expect(fillForm(document, [], '', true, enabled).filled).toBe(0);
    expect(input('chosen-no').checked).toBe(true);
    expect(scanForm(document, []).questions[0].reason).toBe('Existing answer preserved');
  });
  it('does not use a label to fill a hidden, inert or disabled question', () => {
    application(
      `<div hidden>${radio('hidden')}</div><div style="display:none">${radio('css-hidden')}</div>
      <fieldset disabled>${radio('disabled', 'display:none')}</fieldset>
      <div inert>${radio('inert')}</div>${radio('explicit-hidden', '', 'hidden')}`,
    );
    expect(fillForm(document, [], '', true, enabled).filled).toBe(0);
    expect(document.querySelectorAll('input:checked')).toHaveLength(0);
  });
  it('still requires the complete question to contain exactly Yes and No', () => {
    application(radio('three', 'display:none'));
    document
      .querySelector('fieldset')!
      .insertAdjacentHTML(
        'beforeend',
        '<input type="radio" id="maybe" name="urn:li:fsd_formElement:three" value="Maybe" hidden><label for="maybe">Maybe</label>',
      );
    expect(fillForm(document, [], '', true, enabled).filled).toBe(0);
  });
  it('leaves LinkedIn messaging alone when an application is open', () => {
    application(radio('job', 'display:none'));
    document.body.insertAdjacentHTML(
      'beforeend',
      `<aside class="msg-overlay-conversation-bubble">${radio('message', 'display:none')}</aside>`,
    );
    expect(fillForm(document, [], '', true, enabled).filled).toBe(1);
    expect(input('message-yes').checked).toBe(false);
  });
});
