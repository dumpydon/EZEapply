// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://jobs.smartrecruiters.com/oneclick-ui/company/Example/publication/123/screening"}
import { afterEach, expect, it } from 'vitest';
import { fillForm, fillFormWithWidgets, undoFill } from '../src/content';
import { isApplicationField } from '../src/application-context';
const markup = `<main><h1>Preliminary questions</h1><div><p>Are you available for this role?</p><fieldset role="radiogroup"><label><input type="radio" id="yes">Yes</label><label><input type="radio" id="no">No</label></fieldset></div></main>`;
afterEach(() => {
  undoFill();
  document.body.replaceChildren();
});
it('recognizes the scoped screening route and unnamed radio question', () => {
  document.body.innerHTML = markup;
  const report = fillForm(document, [], '', false, { defaultYes: true });
  expect(report.filled).toBe(1);
  expect((document.querySelector('#yes') as HTMLInputElement).checked).toBe(true);
  expect(report.questions[0].label).toBe('Are you available for this role?');
  undoFill();
  expect(document.querySelectorAll('input:checked')).toHaveLength(0);
});
it('does not enable arbitrary SmartRecruiters pages or lookalike domains', () => {
  document.body.innerHTML = markup;
  const control = document.querySelector<HTMLElement>('#yes')!;
  for (const url of [
    'https://jobs.smartrecruiters.com/help',
    'https://smartrecruiters.com.example.org/oneclick-ui/company/Example/publication/123/screening',
  ])
    expect(isApplicationField(control, new URL(url))).toBe(false);
});
it('preserves existing No answers and keeps the toggle opt-in', () => {
  document.body.innerHTML = markup;
  expect(fillForm(document, []).filled).toBe(0);
  (document.querySelector('#no') as HTMLInputElement).checked = true;
  expect(fillForm(document, [], '', false, { defaultYes: true }).filled).toBe(0);
  expect((document.querySelector('#no') as HTMLInputElement).checked).toBe(true);
});

// Structure supplied from the live SAP form: choices are light-DOM custom
// elements; the radiogroup fieldset lives in their host's shadow root.
function slottedQuestion(id: string, title: string, choices = ['Yes', 'No']) {
  const field = document.createElement('spl-form-field');
  field.innerHTML = `<p slot="label" id="${id}-label">${title}</p><spl-radio-group>${choices.map((label, i) => `<spl-radio label="${label}" tabindex="0" inlinelabelcontent="" id="${id}-${i}" variant="default" value="${i + 1}" role="radio" aria-checked="false" aria-disabled="false"></spl-radio>`).join('')}</spl-radio-group>`;
  field.attachShadow({ mode: 'open' }).innerHTML =
    '<div class="c-spl-form-field"><slot name="label"></slot><slot name="description"></slot><slot></slot></div>';
  const host = field.querySelector('spl-radio-group')!;
  host.attachShadow({ mode: 'open' }).innerHTML =
    `<fieldset role="radiogroup" aria-labelledby="${id}-label" aria-required="true"><slot></slot></fieldset>`;
  for (const radio of host.querySelectorAll('spl-radio')) {
    radio.attachShadow({ mode: 'open' }).innerHTML =
      '<div class="c-spl-radio"><div class="c-spl-radio__ring"></div></div>';
    radio.addEventListener('click', () => {
      for (const sibling of host.children)
        sibling.setAttribute('aria-checked', String(sibling === radio));
    });
  }
  document.querySelector('main')!.append(field);
  return host;
}
it.each([false, true])(
  'fills slotted custom Yes/No radios via the component click handler (automatic: %s)',
  async (automatic) => {
    document.body.innerHTML = '<main><h1>Preliminary questions</h1></main>';
    const first = slottedQuestion('availability', 'Are you available for this role?');
    const second = slottedQuestion('relocate', 'Can you relocate for this role?');
    const report = await fillFormWithWidgets(document, [], '', automatic, undefined, {
      defaultYes: true,
    });
    expect(report.filled).toBe(2);
    expect(report.questions.map((q) => q.label)).toEqual([
      'Are you available for this role?',
      'Can you relocate for this role?',
    ]);
    for (const group of [first, second]) {
      expect(group.children[0].getAttribute('aria-checked')).toBe('true');
      expect(group.children[1].getAttribute('aria-checked')).toBe('false');
    }
  },
);
it('preserves No and excludes disabled, hidden, nonbinary and consent groups in slotted controls', () => {
  document.body.innerHTML = '<main><h1>Preliminary questions</h1></main>';
  const existing = slottedQuestion('existing', 'Are you available?');
  existing.children[1].setAttribute('aria-checked', 'true');
  const disabled = slottedQuestion('disabled', 'Can you relocate?');
  disabled.children[1].setAttribute('aria-disabled', 'true');
  const hidden = slottedQuestion('hidden', 'Are you ready?');
  hidden.shadowRoot!.querySelector('fieldset')!.hidden = true;
  slottedQuestion('three', 'Choose availability', ['Yes', 'No', 'Maybe']);
  slottedQuestion('consent', 'Do you consent to processing personal data?');
  expect(fillForm(document, [], '', false, { defaultYes: true }).filled).toBe(0);
  expect(document.querySelectorAll('[aria-checked="true"]')).toHaveLength(1);
  expect(existing.children[1].getAttribute('aria-checked')).toBe('true');
});
