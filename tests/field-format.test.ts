// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fillFormWithWidgets, scanForm, undoFill } from '../src/content';
import { fieldFormatHints, fieldMatchingLabels } from '../src/field-format';
import { fieldLabels } from '../src/form-labels';
import type { CustomField } from '../src/types';

const field = (
  id: string,
  label: string,
  value: string,
  matchMode: CustomField['matchMode'] = 'phrase',
): CustomField => ({
  id,
  label,
  value,
  matchMode,
  aliases: [],
  exclude: [],
  scope: '',
  category: 'Personal',
  enabled: true,
});
const answers = [
  field('current', 'Current CTC', '8'),
  field('current-inr', 'current ctc in INR', '800000'),
  field('expected', 'expected CTC', '9'),
  field('expected-inr', 'expected ctc in INR', '900000'),
  field('exact-inr', 'Expected CTC (INR)', '900000', 'exact'),
];
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const pseudo = new Map<Element, { content: string; display?: string }>();
const salary = (id: string, kind = 'Expected') =>
  `<div class="form-group"><label>${kind} CTC (INR)</label><div class="money-input"><input id="${id}" name="${kind.toLowerCase()}_ctc" type="text" inputmode="numeric" placeholder="Ex: 15.5"></div></div>`;
beforeEach(() => {
  pseudo.clear();
  const computed = window.getComputedStyle.bind(window);
  vi.stubGlobal('CSS', { supports: () => true });
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) =>
    pseudoElement
      ? ({
          content: pseudoElement === '::after' ? pseudo.get(element)?.content || 'none' : 'none',
          display: pseudo.get(element)?.display || 'inline',
          visibility: 'visible',
        } as CSSStyleDeclaration)
      : computed(element),
  );
});
afterEach(() => {
  undoFill();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('visible field amount formats', () => {
  it('uses CSS-only lakh suffixes on controlled salary widgets instead of their INR-only label', async () => {
    document.body.innerHTML = salary('current', 'Current') + salary('expected');
    for (const wrapper of document.querySelectorAll('.money-input'))
      pseudo.set(wrapper, { content: '"lacs per annum"' });
    const changes: string[] = [];
    for (const control of [input('current'), input('expected')]) {
      // The real widget allows nonnegative decimal lakh values below 1000.
      control.addEventListener('input', () => {
        if (Number(control.value) >= 1000) control.value = '';
      });
      control.addEventListener('change', () => changes.push(control.value));
    }
    const report = await fillFormWithWidgets(document, answers, 'platform.example.test');
    expect(report.filled).toBe(2);
    expect(input('current').value).toBe('8');
    expect(input('expected').value).toBe('9');
    expect(report.questions.map((question) => question.matchedField)).toEqual([
      'current',
      'expected',
    ]);
    expect(changes).toEqual(['8', '9']);
    expect(report.questions[1].label).toContain('lakh');
  });
  it('prefers an explicitly saved lakh answer over the generic CTC fallback', async () => {
    document.body.innerHTML = salary('expected');
    pseudo.set(document.querySelector('.money-input')!, { content: '"lacs per annum"' });
    const report = await fillFormWithWidgets(document, [
      ...answers,
      field('lakh', 'Expected CTC in lakhs', '10.5'),
    ]);
    expect(input('expected').value).toBe('10.5');
    expect(report.questions[0].matchedField).toBe('lakh');
  });
  it('does not convert a rupee answer when no saved lakh variant exists, even with an exact INR-only label', async () => {
    document.body.innerHTML = salary('expected');
    pseudo.set(document.querySelector('.money-input')!, { content: '"lacs per annum"' });
    const report = await fillFormWithWidgets(
      document,
      answers.filter((answer) => answer.id.includes('inr')),
    );
    expect(report.filled).toBe(0);
    expect(input('expected').value).toBe('');
    expect(report.questions[0].reason).toContain('different units');
  });
  it('reads visible DOM suffix text and attached helper text', async () => {
    document.body.innerHTML =
      salary('expected') +
      `<p id="unit">Enter your amount in lakhs per annum</p><label>Current CTC (INR)<input id="current" aria-describedby="unit"></label>`;
    document
      .querySelector('.money-input')!
      .insertAdjacentHTML('beforeend', '<span>lacs per annum</span>');
    const report = await fillFormWithWidgets(document, answers);
    expect(report.filled).toBe(2);
    expect(input('expected').value).toBe('9');
    expect(input('current').value).toBe('8');
  });
  it('keeps INR base amounts when an example placeholder has decimals but no scale hint', async () => {
    document.body.innerHTML = salary('expected');
    expect((await fillFormWithWidgets(document, answers)).filled).toBe(1);
    expect(input('expected').value).toBe('900000');
  });
  it('does not borrow units from adjacent salary or experience fields', async () => {
    document.body.innerHTML = `<div>${salary('expected')}${salary('current', 'Current')}<label>Years of experience<input id="experience"></label><span>million per month</span></div>`;
    pseudo.set(input('current').parentElement!, { content: '"lacs per annum"' });
    const report = await fillFormWithWidgets(document, answers);
    expect(report.filled).toBe(2);
    expect(input('expected').value).toBe('900000');
    expect(input('current').value).toBe('8');
  });
  it('ignores hidden text and hidden generated content', async () => {
    document.body.innerHTML = salary('expected');
    document
      .querySelector('.money-input')!
      .insertAdjacentHTML(
        'beforeend',
        '<span hidden>lakh</span><span style="display:none">million</span>',
      );
    pseudo.set(document.querySelector('.money-input')!, {
      content: '"lacs per annum"',
      display: 'none',
    });
    expect((await fillFormWithWidgets(document, answers)).filled).toBe(1);
    expect(input('expected').value).toBe('900000');
  });
  it.each(['lakh crore per annum', 'EUR per annum', 'lakh per month per annum'])(
    'leaves conflicting format guidance for review: %s',
    (hint) => {
      document.body.innerHTML = salary('expected');
      pseudo.set(document.querySelector('.money-input')!, { content: JSON.stringify(hint) });
      const report = scanForm(document, answers);
      expect(report.questions[0].reason).toContain('conflicting');
      expect(input('expected').value).toBe('');
    },
  );
  it('uses monthly guidance without inferring an annual period from an unqualified CTC label', async () => {
    document.body.innerHTML = salary('expected');
    pseudo.set(document.querySelector('.money-input')!, { content: '"INR per month"' });
    const report = await fillFormWithWidgets(document, [
      ...answers,
      field('monthly', 'Expected CTC in INR per month', '75000'),
    ]);
    expect(report.filled).toBe(1);
    expect(input('expected').value).toBe('75000');
  });
  it('reads a field-local affix through an open shadow-root wrapper', async () => {
    document.body.innerHTML =
      '<div class="form-group"><label>Expected CTC (INR)</label><app-money></app-money></div>';
    const shadow = document.querySelector('app-money')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<div><input id="shadow-pay"><span>lacs per annum</span></div>';
    expect((await fillFormWithWidgets(document, answers)).filled).toBe(1);
    expect(shadow.querySelector('input')!.value).toBe('9');
  });
  it('decodes text-only CSS escapes and ignores URL/counter/icon content as unit signals', () => {
    document.body.innerHTML = salary('expected');
    const wrapper = document.querySelector('.money-input')!;
    pseudo.set(wrapper, { content: '"lacs\\20 per annum"' });
    expect(fieldFormatHints(input('expected'))).toContain('lacs per annum');
    pseudo.set(wrapper, { content: 'url("https://example.test/lakh.svg")' });
    expect(fieldMatchingLabels(input('expected'), fieldLabels(input('expected'))).labels[0]).toBe(
      'Expected CTC (INR)',
    );
  });
});
