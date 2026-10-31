// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchableWidget } from '../fixtures/searchable-widget';
import { siblingDropdown } from '../fixtures/sibling-dropdown';
import { comboboxValue, fillCombobox } from '../src/widgets';
import { fieldQuestion } from '../src/form-labels';
import { fillFormWithWidgets, scanForm, undoFill } from '../src/content';
import type { CustomField } from '../src/types';

beforeEach(() => {
  document.body.replaceChildren();
  vi.useFakeTimers();
});
afterEach(() => {
  undoFill();
  vi.useRealTimers();
  document.body.replaceChildren();
});
async function finish<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}
const gender: CustomField = {
  id: 'gender',
  label: 'Gender *',
  value: 'Male',
  aliases: [],
  exclude: [],
  enabled: true,
  category: 'Personal',
  matchMode: 'phrase',
  scope: '',
};

describe('searchable web-component dropdowns', () => {
  it.each([false, true])(
    'selects a sibling-owned popup (active descendant: %s)',
    async (activeDescendant) => {
      const widget = siblingDropdown(document.body, { activeDescendant });
      if (activeDescendant) widget.popup.removeAttribute('aria-owns');
      const saved = { ...gender, id: 'prefix', label: 'prefix*', value: 'mr' };
      expect(comboboxValue(widget.control)).toBe('');
      expect((await finish(fillFormWithWidgets(document, [saved]))).filled).toBe(1);
      expect(widget.select.value).toBe('101');
      expect(widget.selections).toBe(1);
      expect(comboboxValue(widget.control)).toBe('Mr.');
      expect((await finish(fillFormWithWidgets(document, [saved]))).filled).toBe(0);
      expect(widget.selections).toBe(1);
    },
  );
  it('requires a sibling backing select to confirm the choice', async () => {
    const widget = siblingDropdown(document.body, { rejectSelection: true });
    widget.list.children[1].addEventListener('click', () => {
      widget.control.querySelector('span')!.textContent = 'Mr.';
      widget.control.setAttribute('aria-expanded', 'false');
    });
    expect((await finish(fillCombobox(widget.control, 'MR.'))).filled).toBe(false);
    expect(widget.select.value).toBe('-1');
  });
  it('does not borrow a listbox owned by an adjacent, separately labelled question', async () => {
    const widget = siblingDropdown(document.body);
    const label = document.createElement('label');
    label.textContent = 'A different question';
    widget.popup.prepend(label);
    expect((await finish(fillCombobox(widget.control, 'Mr.'))).filled).toBe(false);
    expect(widget.select.value).toBe('-1');
    expect(widget.selections).toBe(0);
  });
  it('discovers the outer question and treats the component as one logical field', () => {
    const widget = searchableWidget(document.body);
    expect(fieldQuestion(widget.control)).toBe('Gender *');
    const report = scanForm(document, [gender]);
    expect(report.questions).toHaveLength(1);
    expect(report.questions[0]).toMatchObject({
      label: 'Gender *',
      kind: 'combobox',
      matchedField: 'gender',
      filled: false,
    });
  });
  it('selects through the widget’s mousedown handler and records its committed state', async () => {
    const widget = searchableWidget(document.body);
    expect((await finish(fillFormWithWidgets(document, [gender]))).filled).toBe(1);
    expect(widget.value).toBe('Male');
    expect(widget.select.value).toBe('1');
    expect(widget.selections).toBe(1);
    expect(comboboxValue(widget.control)).toBe('Male');
  });
  it('searches keyup-filtered delayed options before selecting, without confusing Male and Female', async () => {
    const widget = searchableWidget(document.body, ['Female', 'Male'], {
      searchableOnly: true,
      delay: 180,
    });
    expect((await finish(fillCombobox(widget.control, 'Male'))).filled).toBe(true);
    expect(widget.value).toBe('Male');
    expect(widget.selections).toBe(1);
  });
  it('never treats the first highlighted option as an accepted answer', async () => {
    const widget = searchableWidget(document.body, ['Male', 'Female'], { rejectSelection: true });
    expect(widget.list.firstElementChild?.getAttribute('aria-selected')).toBe('true');
    expect((await finish(fillCombobox(widget.control, 'Male'))).filled).toBe(false);
    expect(widget.value).toBe('');
    expect(widget.select.value).toBe('');
    expect(widget.selections).toBe(0);
  });
  it('preserves a committed choice and avoids clicking it a second time', async () => {
    const widget = searchableWidget(document.body);
    await finish(fillCombobox(widget.control, 'Male'));
    expect((await finish(fillFormWithWidgets(document, [gender]))).filled).toBe(0);
    expect(widget.value).toBe('Male');
    expect(widget.selections).toBe(1);
  });
  it('fills another saved topic using the same adapter', async () => {
    const widget = searchableWidget(document.body, ['India', 'Indonesia'], {
      label: 'Country',
      searchableOnly: true,
    });
    expect((await finish(fillCombobox(widget.control, 'India'))).filled).toBe(true);
    expect(widget.value).toBe('India');
  });
  it('waits for remote-style options rather than assuming they appear immediately', async () => {
    const widget = searchableWidget(document.body, ['Male', 'Female'], {
      searchableOnly: true,
      delay: 1000,
    });
    expect((await finish(fillCombobox(widget.control, 'Male'))).filled).toBe(true);
    expect(widget.value).toBe('Male');
  });
  it('keeps a missing saved answer and substring lookalikes unselected', async () => {
    const widget = searchableWidget(document.body, ['Female'], { searchableOnly: true });
    expect((await finish(fillCombobox(widget.control, 'Male'))).filled).toBe(false);
    expect(widget.value).toBe('');
    expect(widget.input.value).toBe('');
  });
  it('does not overwrite an existing unfinished search', async () => {
    const widget = searchableWidget(document.body);
    widget.input.value = 'Ma';
    const result = await finish(fillFormWithWidgets(document, [gender]));
    expect(result.filled).toBe(0);
    expect(widget.input.value).toBe('Ma');
    expect(widget.selections).toBe(0);
  });
  it('does not let automatic fill steal focus from a dropdown being edited inside shadow DOM', async () => {
    document.body.innerHTML = '<form aria-label="Job application"></form>';
    const widget = searchableWidget(document.querySelector('form')!);
    widget.control.click();
    expect(widget.control.getRootNode()).not.toBe(document);
    expect(document.activeElement).toBe(widget.host);
    expect(
      (await finish(fillFormWithWidgets(document, [gender], 'example.com', true))).filled,
    ).toBe(0);
    expect(widget.value).toBe('');
    expect(widget.selections).toBe(0);
    expect((await finish(fillFormWithWidgets(document, [gender]))).filled).toBe(1);
    expect(widget.value).toBe('Male');
  });
  it('rejects a multi-select wrapper even if its listbox omits the ARIA multiple flag', async () => {
    const widget = searchableWidget(document.body);
    widget.control.dataset.type = 'select-multiple';
    expect((await finish(fillCombobox(widget.control, 'Male'))).reason).toContain(
      'Multiple-choice',
    );
    expect(widget.selections).toBe(0);
  });
});
