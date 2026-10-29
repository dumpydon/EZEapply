// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { fieldLabels, fieldQuestion, fieldInstructions } from '../src/form-labels';
import { aiFields, fillForm } from '../src/content';
afterEach(() => document.body.replaceChildren());

describe('real question discovery', () => {
  it('reads a field label outside an open shadow-root input instead of Enter Here', () => {
    document.body.innerHTML =
      '<form id="job-application"><div class="form-group"><label>Describe a custom tool you built for daily work *</label><app-text-field></app-text-field></div></form>';
    const shadow = document.querySelector('app-text-field')!.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<div class="input-container"><div class="input-wrapper"><div class="input-container"><input placeholder="Enter Here" aria-label="Enter Here"></div></div></div>';
    const input = shadow.querySelector('input')!;
    expect(fieldQuestion(input)).toBe('Describe a custom tool you built for daily work *');
    expect(aiFields()[0].question).toBe(fieldQuestion(input));
    expect(fieldLabels(input)).not.toContain('Enter Here');
  });
  it('uses the same cross-root label for saved-answer matching and linked helper text', () => {
    document.body.innerHTML =
      '<div class="form-group"><label>What is your current notice period?</label><p id="hint">Enter days only</p><app-field></app-field></div>';
    const shadow = document.querySelector('app-field')!.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<div><div><input placeholder="Your answer" aria-describedby="hint"></div></div>';
    const input = shadow.querySelector('input')!;
    expect(fieldInstructions(input)).toBe('Enter days only');
    expect(
      fillForm(document, [
        {
          id: 'notice',
          label: 'Notice period',
          value: '7',
          aliases: [],
          exclude: [],
          enabled: true,
          category: 'Personal',
          matchMode: 'phrase',
          scope: '',
        },
      ]).filled,
    ).toBe(1);
    expect(input.value).toBe('7');
  });
  it('does not borrow another field’s label or offer AI for a generic placeholder alone', () => {
    document.body.innerHTML =
      '<div class="form-group"><label>Describe your best project</label><input id="one" placeholder="Enter Here"><input id="two" placeholder="Enter Here"></div><input id="unknown" name="question_123" placeholder="Enter Here">';
    expect(fieldQuestion(document.querySelector<HTMLInputElement>('#two')!)).toBe('');
    expect(fieldQuestion(document.querySelector<HTMLInputElement>('#unknown')!)).toBe('');
    expect(aiFields().map((field) => field.element.id)).not.toContain('unknown');
  });
});
