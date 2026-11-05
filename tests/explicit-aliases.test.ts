// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.linkedin.com/jobs/view/123456/"}
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchField } from '../src/matcher';
import { getAutofillData } from '../src/storage';
import { fillFormWithWidgets, scanForm, undoFill } from '../src/content';
import { STORAGE_KEY, type CustomField } from '../src/types';

const field = (
  id: string,
  label: string,
  value: string,
  aliases: string[] = [],
  extra: Partial<CustomField> = {},
): CustomField => ({
  id,
  label,
  value,
  aliases,
  category: 'Compensation',
  enabled: true,
  matchMode: 'phrase',
  exclude: [],
  scope: '',
  ...extra,
});
const fields = () => [
  field('current-generic', 'Current CTC', '9'),
  field('current-inr', 'current ctc in INR', '900000', ['current ctc in rupees', 'Current Salary']),
  field('expected-generic', 'expected CTC', '9'),
  field('expected-inr', 'expected ctc in INR', '900000', ['Desired Salary *', 'Expected Salary*']),
];

afterEach(() => {
  undoFill();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('explicit saved aliases with omitted monetary units', () => {
  it.each([
    ['Current Salary*', 'current-inr'],
    ['Expected Salary*', 'expected-inr'],
    ['Please enter your CURRENT SALARY (required)', 'current-inr'],
    ['What is your expected salary?', 'expected-inr'],
    ['Salary expected', 'expected-inr'],
    ['Your desired salary', 'expected-inr'],
  ])('uses the deliberately assigned answer for %s', (question, id) => {
    const match = matchField([question], fields(), 'www.linkedin.com');
    expect(match.field?.id).toBe(id);
    expect(match.field?.value).toBe('900000');
  });

  it('supports explicit aliases for other monetary topics and currencies without converting the answer', () => {
    const saved = field('usd', 'Expected annual compensation in USD', '120000', [
      'Desired annual remuneration',
    ]);
    expect(
      matchField(['Please enter your desired annual remuneration'], [saved], '').field?.value,
    ).toBe('120000');
  });

  it('keeps unqualified CTC defaults separate unless the user explicitly maps that wording to another answer', () => {
    expect(matchField(["What's your expected CTC?"], fields(), '').field?.value).toBe('9');
    const mapped = field('inr', 'Expected CTC in INR', '900000', ['Expected CTC']);
    expect(matchField(["What's your expected CTC?"], [mapped], '').field?.value).toBe('900000');
    expect(matchField(['Expected CTC'], [mapped, fields()[2]], '').reason).toContain('Multiple');
    expect(
      matchField(['Expected Salary'], [{ ...fields()[3], aliases: [] }], '').field,
    ).toBeUndefined();
  });

  it.each([
    'Expected Salary in lakhs',
    'Expected Salary in USD',
    'Expected monthly Salary',
    'Expected fixed Salary',
    'Expected variable Salary',
    'Describe your expected salary',
    'Expected salary percentage increase',
    'Is your expected salary negotiable?',
  ])('still rejects an explicit format or meaning conflict: %s', (question) => {
    expect(matchField([question], [fields()[3]], '').field).toBeUndefined();
  });

  it('does not borrow an alias match from a secondary machine name to erase the visible format', () => {
    expect(
      matchField(['Expected salary in lakhs', 'Expected Salary'], [fields()[3]], '').field,
    ).toBeUndefined();
    expect(
      matchField(['Expected CTC', 'Expected Salary'], [fields()[3]], '').field,
    ).toBeUndefined();
  });

  it('does not treat a broad word within a different question as an explicit mapping', () => {
    const saved = field('salary', 'Expected CTC in INR', '900000', ['salary']);
    expect(matchField(['What is your expected salary?'], [saved], '').field).toBeUndefined();
  });

  it('does not turn an alias that specifies units into an unqualified mapping', () => {
    const saved = field('inr', 'Expected CTC in INR', '900000', ['Expected Salary in INR']);
    expect(matchField(['Expected Salary'], [saved], '').field).toBeUndefined();
    expect(matchField(['Expected Salary in INR'], [saved], '').field?.value).toBe('900000');
  });

  it('rejects contradictory unit aliases and current/expected aliases', () => {
    const wrongUnits = field('wrong', 'Expected CTC in INR', '900000', [
      'Expected Salary in lakhs',
    ]);
    expect(matchField(['Expected Salary in lakhs'], [wrongUnits], '').field).toBeUndefined();
    const wrongQualifier = field('wrong', 'Current CTC in INR', '900000', ['Expected Salary']);
    expect(matchField(['Expected Salary'], [wrongQualifier], '').field).toBeUndefined();
  });

  it('requires disambiguation if two saved answers explicitly claim the same question', () => {
    const saved = [fields()[3], field('other', 'Expected salary', '9')];
    expect(matchField(['Expected Salary'], saved, '').reason).toContain('Multiple');
    expect(matchField(['Expected Salary'], saved, '').field).toBeUndefined();
  });

  it('preserves site scope, exclusions, disabled answers and strict exact mode', () => {
    for (const change of [
      { enabled: false },
      { value: '' },
      { scope: 'example.test' },
      { exclude: ['salary'] },
    ])
      expect(
        matchField(['Expected Salary'], [{ ...fields()[3], ...change }], 'www.linkedin.com').field,
      ).toBeUndefined();
    const exact = { ...fields()[3], matchMode: 'exact' as const };
    expect(matchField(['Expected Salary*'], [exact], '').field?.value).toBe('900000');
    expect(matchField(['Please enter your expected salary'], [exact], '').field).toBeUndefined();
  });

  it.each([false, true])(
    'fills both salary aliases from persisted fields (automatic: %s), emits events and supports Undo',
    async (automatic) => {
      const saved = fields();
      saved[1].value = '800000';
      vi.stubGlobal('chrome', {
        storage: {
          local: {
            get: async () => ({
              profile: {},
              [STORAGE_KEY]: { version: 1, profiles: { local: { autoFill: true, fields: saved } } },
            }),
          },
        },
      });
      document.body.innerHTML = `<div role="dialog" aria-label="Apply to Example">
      <h2>Additional Questions</h2>
      <label for="current">Current Salary*</label><input id="current" type="text" inputmode="numeric" maxlength="20">
      <label for="expected">Expected Salary*</label><input id="expected" type="text" inputmode="numeric" maxlength="20">
      <label for="unrelated">Current Employer*</label><input id="unrelated">
    </div>`;
      const events = vi.fn();
      document.getElementById('current')!.addEventListener('change', events);
      const data = await getAutofillData();
      const before = scanForm(document, data.fields, 'www.linkedin.com');
      expect(before.questions.slice(0, 2).map((question) => question.matchedField)).toEqual([
        'current-inr',
        'expected-inr',
      ]);
      const result = await fillFormWithWidgets(
        document,
        data.fields,
        'www.linkedin.com',
        automatic,
      );
      expect(result.filled).toBe(2);
      expect((document.getElementById('current') as HTMLInputElement).value).toBe('800000');
      expect((document.getElementById('expected') as HTMLInputElement).value).toBe('900000');
      expect((document.getElementById('unrelated') as HTMLInputElement).value).toBe('');
      expect(events).toHaveBeenCalled();
      expect(undoFill().filled).toBe(2);
      expect((document.getElementById('expected') as HTMLInputElement).value).toBe('');
    },
  );
});
