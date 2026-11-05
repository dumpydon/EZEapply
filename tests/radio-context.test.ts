// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.linkedin.com/jobs/view/123"}
import { afterEach, describe, expect, it } from 'vitest';
import { fillFormWithWidgets, scanForm, undoFill } from '../src/content';
import type { CustomField } from '../src/types';

const yes = { defaultYes: true };
function question(name: string, title: string, choices = ['Yes', 'No'], hidden = false) {
  return `<div class="question-block"><p>${title}</p><div class="options">${choices
    .map(
      (choice, index) =>
        `<div class="option"><span><input type="radio" name="${name}" value="${index}" ${hidden ? 'style="display:none"' : ''}></span><span>${choice}</span></div>`,
    )
    .join('')}</div></div>`;
}
function application(html: string) {
  document.body.innerHTML = `<div role="dialog"><div><p>Apply to Example</p></div><form><p>Additional Questions</p>${html}</form></div>`;
}
const selected = () =>
  [...document.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => input.value);
afterEach(() => {
  undoFill();
  document.body.replaceChildren();
});

describe('radio text rendered without HTML label associations', () => {
  it.each([false, true])(
    'reads adjacent text and fills opaque-valued radio pairs (CSS-hidden input: %s)',
    async (hidden) => {
      application(
        question(
          'radio-group-_r_4s_',
          'Have you worked on Payments Platform?',
          ['Yes', 'No'],
          hidden,
        ) +
          question(
            'radio-group-_r_51_',
            'Do you have experience with AI tools?',
            ['Yes', 'No'],
            hidden,
          ),
      );
      const scanned = scanForm(document, []);
      expect(scanned.questions.map((item) => item.label)).toEqual([
        'Have you worked on Payments Platform?',
        'Do you have experience with AI tools?',
      ]);
      const report = await fillFormWithWidgets(document, [], '', true, undefined, yes);
      expect(report.filled).toBe(2);
      expect(selected()).toEqual(['0', '0']);
    },
  );
  it('matches a saved answer using the actual question instead of the generated group name', async () => {
    application(question('radio-group-_r_51_', 'Are you willing to relocate?'));
    const saved: CustomField = {
      id: 'relocate',
      label: 'Are you willing to relocate?',
      value: 'No',
      aliases: [],
      exclude: [],
      enabled: true,
      category: 'Personal questions',
      scope: '',
      matchMode: 'exact',
    };
    expect((await fillFormWithWidgets(document, [saved])).filled).toBe(1);
    expect(selected()).toEqual(['1']);
  });
  it('clicks a CSS-hidden input’s visual wrapper when the application handles clicks there', async () => {
    application(question('opaque', 'Ready to start?', ['Yes', 'No'], true));
    const first = document.querySelector<HTMLElement>('.option')!;
    let committed = false;
    first.addEventListener('click', () => {
      committed = true;
      first.querySelector<HTMLInputElement>('input')!.checked = true;
    });
    expect((await fillFormWithWidgets(document, [], '', true, undefined, yes)).filled).toBe(1);
    expect(committed).toBe(true);
  });
  it('preserves an existing No and does not use a qualified option as a plain Yes', async () => {
    application(
      question('existing', 'A previous answer') +
        question('qualified', 'Available to move?', ['Yes, within India', 'No']),
    );
    document.querySelector<HTMLInputElement>('input[name="existing"][value="1"]')!.checked = true;
    expect((await fillFormWithWidgets(document, [], '', true, undefined, yes)).filled).toBe(0);
    expect(selected()).toEqual(['1']);
  });
  it('keeps all options in the group and explains an unsupported pair', async () => {
    application(question('three', 'Choose availability', ['Yes', 'No', 'Maybe']));
    const result = await fillFormWithWidgets(document, [], '', true, undefined, yes);
    expect(result.filled).toBe(0);
    expect(result.questions[0].reason).toContain('Yes / No / Maybe');
  });
  it('does not borrow Yes/No text from an adjacent group or a different control', async () => {
    application(
      `<div class="question-block"><p>Unlabelled choices</p><input type="radio" name="unknown" value="0"><input type="radio" name="unknown" value="1"></div>` +
        question('good', 'A separate question') +
        `<div><input type="radio" name="other" value="0"><input type="text" value="Yes"><span>Yes</span></div><div><input type="radio" name="other" value="1"><input type="text" value="No"><span>No</span></div>`,
    );
    const report = await fillFormWithWidgets(document, [], '', true, undefined, yes);
    expect(report.filled).toBe(1);
    expect(document.querySelector<HTMLInputElement>('input[name="good"]')!.checked).toBe(true);
    expect(
      document.querySelectorAll('input[name="unknown"]:checked,input[name="other"]:checked'),
    ).toHaveLength(0);
  });
  it('ignores misleading hidden text and icons inside option wrappers', async () => {
    application(
      question('decorated', 'Ready for onboarding?', [
        '<svg><text>cancel</text></svg><span hidden>No</span>Yes',
        '<span aria-hidden="true">Yes</span>No',
      ]),
    );
    expect((await fillFormWithWidgets(document, [], '', true, undefined, yes)).filled).toBe(1);
    expect(selected()).toEqual(['0']);
  });
  it('uses readable failure reasons for a Yes/No pair outside an application', async () => {
    document.body.innerHTML = `<form>${question('survey', 'Customer survey')}</form>`;
    const report = await fillFormWithWidgets(document, [], '', false, undefined, yes);
    expect(report.filled).toBe(0);
    expect(report.questions[0].reason).toContain('could not identify this as an application');
  });
});
