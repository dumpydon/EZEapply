// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/storage', () => ({
  getAutofillData: vi.fn(async () => ({ fields: [], autoFill: false, defaultYes: false })),
}));
import { getAutofillData } from '../src/storage';
import { fillForm, fillFormWithWidgets, startContent, undoFill } from '../src/content';
import { DEFAULT_YES_KEY, type CustomField, type FillReport } from '../src/types';

const yes = { defaultYes: true };
const radio = (id: string, extra = '', name = id) => `<fieldset><legend>${id}</legend>
  <label><input type="radio" name="${name}" value="1" id="${id}-yes"> YES </label>
  <label><input type="radio" name="${name}" value="0" id="${id}-no">No.</label>${extra}</fieldset>`;
function application(html: string) {
  document.body.innerHTML = `<form aria-label="Job application">${html}</form>`;
}
function input(id: string) {
  return document.getElementById(id) as HTMLInputElement;
}
beforeEach(() => {
  history.replaceState({}, '', '/jobs/apply');
  document.body.replaceChildren();
});
afterEach(() => {
  undoFill();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  history.replaceState({}, '', '/');
});

describe('opt-in Yes/No defaults', () => {
  it('clicks Yes for complete binary questions without needing saved answers', async () => {
    application(radio('python') + radio('onboarding'));
    const events: string[] = [];
    input('python-yes').addEventListener('change', () => events.push('change'));
    expect(fillForm(document, []).filled).toBe(0);
    const report = await fillFormWithWidgets(document, [], '', false, undefined, yes);
    expect(report.filled).toBe(2);
    expect(report.skipped).toBe(0);
    expect(input('python-yes').checked).toBe(true);
    expect(input('onboarding-yes').checked).toBe(true);
    expect(events).toEqual(['change']);
    expect(report.questions.every((q) => q.reason === 'Selected Yes by your default')).toBe(true);
  });
  it('requires exactly two Yes/No options, including hidden or disabled alternatives', () => {
    application(
      radio('three', '<label><input type="radio" name="three">Maybe</label>') +
        radio('hidden', '<label hidden><input type="radio" name="hidden">Maybe</label>') +
        radio('disabled', '<label><input type="radio" name="disabled" disabled>Maybe</label>') +
        radio('duplicate', '<label><input type="radio" name="duplicate">Yes</label>') +
        '<fieldset><legend>Other</legend><label><input type="radio" name="other">Yes, sometimes</label><label><input type="radio" name="other">No</label></fieldset>',
    );
    expect(fillForm(document, [], '', false, yes).filled).toBe(0);
    expect(document.querySelectorAll('input:checked')).toHaveLength(0);
  });
  it('keeps existing No choices, while the enabled default takes precedence for blank binary questions', () => {
    const field: CustomField = {
      id: 'python',
      label: 'python',
      value: 'No',
      aliases: [],
      exclude: [],
      category: 'Personal questions',
      enabled: true,
      scope: '',
      matchMode: 'exact',
    };
    application(radio('python') + radio('chosen'));
    input('chosen-no').checked = true;
    const report = fillForm(document, [field], '', false, yes);
    expect(report.filled).toBe(1);
    expect(input('python-yes').checked).toBe(true);
    expect(input('chosen-no').checked).toBe(true);
    expect(report.questions[0].matchedField).toBeUndefined();
    expect(report.questions[1].reason).toBe('Existing answer preserved');
  });
  it('handles native Yes/No dropdowns but not multiple-choice lists or extra answers', () => {
    application(`<label>Ready to start<select id="binary"><option value="-1">Select an option</option><option value="Y">Yes</option><option value="N">No</option></select></label>
      <label>Another<select id="three"><option value="">Select</option><option>Yes</option><option>No</option><option>Maybe</option></select></label>
      <label>Many<select id="multiple" multiple><option>Yes</option><option>No</option></select></label>
      <label><input type="checkbox" id="follow">Yes</label><label><input type="checkbox">No</label>`);
    expect(fillForm(document, [], '', false, yes).filled).toBe(1);
    expect((document.getElementById('binary') as HTMLSelectElement).value).toBe('Y');
    expect((document.getElementById('three') as HTMLSelectElement).value).toBe('');
    expect((document.getElementById('multiple') as HTMLSelectElement).selectedOptions).toHaveLength(
      0,
    );
    expect(input('follow').checked).toBe(false);
  });
  it('isolates anonymous groups and repeated names in separate forms and shadow roots', () => {
    document.body.innerHTML = `<form aria-label="Job application">${radio('first', '', '')}${radio('second', '', '')}${radio('same-a', '', 'same')}</form>
      <form aria-label="Job application">${radio('same-b', '', 'same')}</form>
      <form aria-label="Job application"><div id="shadow"></div></form>`;
    const shadow = document.getElementById('shadow')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = radio('shadow', '', 'same');
    expect(fillForm(document, [], '', false, yes).filled).toBe(5);
    for (const id of ['first', 'second', 'same-a', 'same-b'])
      expect(input(`${id}-yes`).checked).toBe(true);
    expect(shadow.querySelector<HTMLInputElement>('#shadow-yes')!.checked).toBe(true);
  });
  it('uses a custom radio group’s own click handler and does not claim unsupported Undo', async () => {
    application(`<div role="radiogroup" aria-label="Ready for this role">
      <button type="button" role="radio" aria-checked="false">Yes</button>
      <button type="button" role="radio" aria-checked="false">No</button></div>`);
    const options = [...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    const clicks = vi.fn();
    for (const option of options)
      option.addEventListener('click', () => {
        clicks();
        options.forEach((other) => other.setAttribute('aria-checked', String(other === option)));
      });
    expect((await fillFormWithWidgets(document, [], '', false, undefined, yes)).filled).toBe(1);
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    expect(undoFill().warnings?.join(' ')).toContain('custom radio');
    expect(options[0].getAttribute('aria-checked')).toBe('true');
  });
  it('does not default unrelated forms or chat even beside an application', () => {
    history.replaceState({}, '', '/forms/123');
    document.body.innerHTML = `<form aria-label="Job application">${radio('job')}</form>
      <form aria-label="Contact us">${radio('contact')}</form>
      <div class="chat-composer">${radio('chat')}</div>`;
    expect(fillForm(document, [], '', false, yes).filled).toBe(1);
    expect(input('job-yes').checked).toBe(true);
    expect(input('contact-yes').checked).toBe(false);
    expect(input('chat-yes').checked).toBe(false);
  });
  it('supports native Undo and reports a framework that resets the choice', async () => {
    application(radio('undo'));
    expect(fillForm(document, [], '', false, yes).filled).toBe(1);
    expect(undoFill().filled).toBe(1);
    expect(input('undo-yes').checked).toBe(false);
    input('undo-yes').addEventListener('change', () => {
      setTimeout(() => {
        input('undo-yes').checked = false;
      }, 0);
    });
    const report = await fillFormWithWidgets(document, [], '', false, undefined, yes);
    expect(report.filled).toBe(0);
    expect(report.questions[0].reason).toContain('reset');
  });
});

describe('automatic Yes/No lifecycle', () => {
  it('fills new steps independently of saved-answer autofill, stops when disabled and pauses after Undo', async () => {
    vi.useFakeTimers();
    const name: CustomField = {
      id: 'name',
      label: 'First name',
      value: 'Alex',
      aliases: [],
      exclude: [],
      category: 'Personal questions',
      enabled: true,
      scope: '',
      matchMode: 'phrase',
    };
    const settings = { fields: [name], autoFill: false, defaultYes: false, masterEnabled: true };
    vi.mocked(getAutofillData).mockImplementation(async () => ({ ...settings }));
    let change: (values: Record<string, unknown>, area: string) => void = () => {};
    let receive: (
      message: unknown,
      sender: unknown,
      respond: (report: FillReport) => void,
    ) => unknown = () => {};
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test',
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
        onMessage: {
          addListener: (fn: typeof receive) => {
            receive = fn;
          },
          removeListener: vi.fn(),
        },
      },
      storage: {
        onChanged: {
          addListener: (fn: typeof change) => {
            change = fn;
          },
          removeListener: vi.fn(),
        },
      },
    });
    application(radio('first') + '<label>First name<input id="name"></label>');
    const stop = startContent();
    const setting = (enabled: boolean) => {
      const before = settings.defaultYes;
      settings.defaultYes = enabled;
      change({ [DEFAULT_YES_KEY]: { oldValue: before, newValue: enabled } }, 'local');
    };
    try {
      await vi.advanceTimersByTimeAsync(600);
      expect(input('first-yes').checked).toBe(false);
      setting(true);
      settings.masterEnabled = false;
      await vi.advanceTimersByTimeAsync(600);
      expect(input('first-yes').checked).toBe(false);
      settings.masterEnabled = true;
      change({ autofillEnabled: { oldValue: false, newValue: true } }, 'local');
      await vi.advanceTimersByTimeAsync(600);
      expect(input('first-yes').checked).toBe(true);
      expect(input('name').value).toBe('');
      document.querySelector('form')!.insertAdjacentHTML('beforeend', radio('next'));
      await vi.advanceTimersByTimeAsync(600);
      expect(input('next-yes').checked).toBe(true);
      setting(false);
      document.querySelector('form')!.insertAdjacentHTML('beforeend', radio('off'));
      await vi.advanceTimersByTimeAsync(600);
      expect(input('off-yes').checked).toBe(false);
      setting(true);
      await vi.advanceTimersByTimeAsync(600);
      const undo = new Promise<FillReport>((resolve) =>
        receive({ type: 'eze-custom:undo' }, {}, resolve),
      );
      await vi.advanceTimersByTimeAsync(10);
      expect((await undo).filled).toBe(3);
      document.querySelector('form')!.insertAdjacentHTML('beforeend', radio('paused'));
      await vi.advanceTimersByTimeAsync(600);
      expect(input('paused-yes').checked).toBe(false);
      setting(false);
      setting(true);
      await vi.advanceTimersByTimeAsync(600);
      expect(input('paused-yes').checked).toBe(true);
    } finally {
      stop();
    }
  });
});
