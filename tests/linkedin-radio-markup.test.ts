// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.linkedin.com/jobs/view/4483938057"}
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { fillFormWithWidgets, scanForm, undoFill } from '../src/content';
import type { CustomField } from '../src/types';

const markup = readFileSync('fixtures/linkedin-radio-group.html', 'utf8');
const question =
  'Are you currently eligible to work in the country where the job office is located?';
const yes = { defaultYes: true };
function mount(style = '') {
  document.body.innerHTML = `<style>input[type=radio]{${style}}</style><div role="dialog"><p>Apply to Playlist</p><form><p>Additional Questions</p>${markup}</form></div>`;
  return [...document.querySelectorAll<HTMLInputElement>('input[type=radio]')];
}
afterEach(() => {
  undoFill();
  document.body.replaceChildren();
});

describe('radio markup captured from LinkedIn Easy Apply', () => {
  it.each(['', 'display:none', 'visibility:hidden'])(
    'separates shared question aria-label from adjacent option paragraphs (%s)',
    async (style) => {
      const controls = mount(style);
      expect(controls.map((input) => input.value)).toEqual(['on', 'on']);
      expect(controls.map((input) => input.labels?.[0].textContent)).toEqual(['', '']);
      expect(scanForm(document, []).questions[0].label).toBe(`${question}*`);
      let changes = 0;
      controls[0].addEventListener('change', () => changes++);
      const result = await fillFormWithWidgets(document, [], '', true, undefined, yes);
      expect(result.filled).toBe(1);
      expect(result.questions[0].reason).toBe('Selected Yes by your default');
      expect(controls.map((input) => input.checked)).toEqual([true, false]);
      expect(changes).toBe(1);
      expect(undoFill().filled).toBe(1);
      expect(controls.every((input) => !input.checked)).toBe(true);
    },
  );
  it('supports Fill this page with two groups, different question text and generated IDs', async () => {
    mount();
    const original = document.querySelector('[componentkey]')!;
    const next = original.cloneNode(true) as HTMLElement;
    next.innerHTML = next.innerHTML
      .replaceAll('_r_5', '_r_7')
      .replaceAll(question, 'Have you worked on Payments Platform?');
    original.after(next);
    const result = await fillFormWithWidgets(document, [], '', false, undefined, yes);
    expect(result.filled).toBe(2);
    expect(
      [...document.querySelectorAll<HTMLInputElement>('input')].map((input) => input.checked),
    ).toEqual([true, false, true, false]);
  });
  it('also selects a saved No without Default Yes and preserves it when Default Yes is enabled', async () => {
    const controls = mount();
    const saved: CustomField = {
      id: 'eligibility',
      label: question,
      value: 'No',
      aliases: [],
      exclude: [],
      enabled: true,
      category: 'Personal questions',
      scope: '',
      matchMode: 'exact',
    };
    expect((await fillFormWithWidgets(document, [saved])).filled).toBe(1);
    expect(controls.map((input) => input.checked)).toEqual([false, true]);
    expect((await fillFormWithWidgets(document, [], '', true, undefined, yes)).filled).toBe(0);
    expect(controls.map((input) => input.checked)).toEqual([false, true]);
  });
  it('does not guess Yes when only a shared question label is available', async () => {
    const controls = mount();
    for (const paragraph of document.querySelectorAll('fieldset p')) paragraph.remove();
    const result = await fillFormWithWidgets(document, [], '', true, undefined, yes);
    expect(result.filled).toBe(0);
    expect(controls.every((input) => !input.checked)).toBe(true);
  });
});
