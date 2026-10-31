// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/storage', () => ({
  getAutofillData: vi.fn(async () => ({ fields: [], autoFill: true })),
}));
import { fillForm, fillFormWithWidgets, isJobContext, scanForm, undoFill } from '../src/content';
import { STORAGE_KEY, type CustomField } from '../src/types';

const field = (id: string, label: string, value: string, aliases: string[] = []): CustomField => ({
  id,
  label,
  value,
  aliases,
  category: 'Personal questions',
  enabled: true,
  matchMode: 'phrase',
  exclude: [],
  scope: '',
});
const rules = [
  field('first', 'First name', 'Alex'),
  field('last', 'Last name', 'Chen'),
  field('expected', 'Expected compensation', '1200000', ['expected ctc']),
  field('current', 'Current compensation', '900000'),
];
const input = (id: string) => document.getElementById(id) as HTMLInputElement;

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  undoFill();
  document.body.innerHTML = '';
});

describe('form interaction', () => {
  it('fills labelled fields independently and emits framework events', () => {
    document.body.innerHTML =
      '<label for="first">First name *</label><input id="first"><label for="last">Last name</label><input id="last"><label for="expected">Expected compensation</label><input id="expected" type="number"><label for="current">Current compensation</label><input id="current" type="number">';
    const events: string[] = [];
    input('first').addEventListener('input', () => events.push('input'));
    input('first').addEventListener('change', () => events.push('change'));
    expect(fillForm(document, rules).filled).toBe(4);
    expect(input('first').value).toBe('Alex');
    expect(input('last').value).toBe('Chen');
    expect(input('expected').value).toBe('1200000');
    expect(input('current').value).toBe('900000');
    expect(events).toEqual(['input', 'change']);
  });
  it('fills reworded LinkedIn-style questions using separate CTC units and the saved notice period', () => {
    document.body.innerHTML = `<div role="dialog" aria-label="Apply to Example">
      <label for="expected">What's your expected CTC? *</label><input id="expected" type="number">
      <label for="rupees">What is your expected CTC in INR?</label><input id="rupees" type="number">
      <label for="lpa">Expected CTC in LPA</label><input id="lpa" type="number">
      <label for="current">What's your current CTC?</label><input id="current" type="number">
      <label for="notice">What's your notice period?</label><input id="notice" type="number">
    </div>`;
    const answers = [
      field('expected-default', 'Your expected CTC', '8'),
      field('expected-inr', 'Please enter your expected CTC in INR', '800000'),
      field('expected-lpa', 'Expected CTC in lakhs', '8.5'),
      field('current-default', 'Your current CTC', '6'),
      field('notice', 'Please enter your notice period in days', '10'),
    ];
    expect(fillForm(document, answers).filled).toBe(5);
    expect(input('expected').value).toBe('8');
    expect(input('rupees').value).toBe('800000');
    expect(input('lpa').value).toBe('8.5');
    expect(input('current').value).toBe('6');
    expect(input('notice').value).toBe('10');
    expect(scanForm(document, answers).questions.every((question) => question.filled)).toBe(true);
  });
  it('explains a missing unit variant instead of filling an INR amount into an unqualified CTC question', () => {
    document.body.innerHTML = `<label for="ctc">What's your expected CTC?</label><input id="ctc" name="expected_ctc_in_inr" type="number">`;
    const report = fillForm(document, [
      field('inr', 'Please enter your expected CTC in INR', '800000', ['expected ctc']),
    ]);
    expect(report.filled).toBe(0);
    expect(input('ctc').value).toBe('');
    expect(report.questions[0].reason).toContain('different units');
  });
  it('fills annual CTC, conditional notice wording and experience without renaming saved labels', () => {
    document.body.innerHTML = `<div role="dialog" aria-label="Apply to Example">
      <label for="current">What is your current CTC per annum (including any variable components)?</label><input id="current" type="number">
      <label for="expected">What is your expected CTC per annum?</label><input id="expected" type="number">
      <label for="notice">What is your notice period? If you are on notice already, when are you available to join?</label><input id="notice" type="number">
      <label for="rupees">What is your expected CTC per annum in INR?</label><input id="rupees" type="number">
      <label for="experience">How many years have you worked in these fields?</label><input id="experience" type="number">
      <label for="python">How many years have you been working with Python?</label><input id="python" type="number">
    </div>`;
    const answers = [
      field('current-lacs', 'What is your Current CTC? (In Lacs)', '9'),
      field('expected-lacs', 'What is your Expected CTC? (In Lacs)', '11'),
      field('expected-inr', 'Please enter your expected CTC in INR', '1100000'),
      field('notice-days', 'Please enter your notice period in days', '10'),
      field('total-experience', 'Total years of professional experience', '2'),
      field('python-experience', 'Python experience in years', '1'),
    ];
    const report = fillForm(document, answers);
    expect(report.filled).toBe(6);
    expect(input('current').value).toBe('9');
    expect(input('expected').value).toBe('11');
    expect(input('notice').value).toBe('10');
    expect(input('rupees').value).toBe('1100000');
    expect(input('experience').value).toBe('2');
    expect(input('python').value).toBe('1');
    expect(report.questions.every((question) => question.filled)).toBe(true);
  });
  it('fills joining-time paraphrases and redundant CTC wording from unqualified saved answers', async () => {
    document.body.innerHTML = `<label>If offered the role, within how many days will you be able to join?*<input id="join" type="number"></label>
      <label>What is your current notice period?*<input id="notice"></label>
      <label>What is your expected CTC salary in Lakh Per Annum?*<input id="expected"></label>
      <label>What is your current CTC salary in Lakh Per Annum?*<input id="current"></label>
      <label>What is your expectation for fixed salary? (annually)*<input id="fixed"></label>`;
    const report = await fillFormWithWidgets(document, [
      field('notice', 'Notice period', '7'),
      field('expected', 'Expected CTC', '9'),
      field('current', 'Current CTC', '8'),
    ]);
    expect(report.filled).toBe(4);
    expect(input('join').value).toBe('7');
    expect(input('notice').value).toBe('7');
    expect(input('expected').value).toBe('9');
    expect(input('current').value).toBe('8');
    expect(input('fixed').value).toBe('');
  });
  it.each(['', 'Page replaced answer'])(
    'reports an asynchronous page replacement (%j) instead of claiming success',
    async (replacement) => {
      document.body.innerHTML = '<input id="notice" aria-label="Notice period">';
      const control = input('notice');
      control.addEventListener(
        'input',
        () =>
          setTimeout(() => {
            control.value = replacement;
          }, 0),
        { once: true },
      );
      const report = await fillFormWithWidgets(document, [field('notice', 'Notice period', '7')]);
      expect(report.filled).toBe(0);
      expect(report.skipped).toBe(1);
      expect(report.questions[0].filled).toBe(false);
      expect(report.questions[0].reason).toContain(replacement ? 'page changed' : 'page reset');
      expect(control.value).toBe(replacement);
      expect(undoFill().filled).toBe(0);
    },
  );
  it('reports an input replaced by the next form step as unverified', async () => {
    document.body.innerHTML = '<input id="notice" aria-label="Notice period">';
    input('notice').addEventListener(
      'input',
      () => setTimeout(() => input('notice').replaceWith(document.createElement('input')), 0),
      { once: true },
    );
    const report = await fillFormWithWidgets(document, [field('notice', 'Notice period', '7')]);
    expect(report.filled).toBe(0);
    expect(report.questions[0].reason).toContain('form step changed');
  });
  it('does not overwrite any prefilled or user-edited answer', () => {
    document.body.innerHTML =
      '<input aria-label="First name" id="first" value="Jordan"><input aria-label="Last name" id="last">';
    expect(fillForm(document, rules).filled).toBe(1);
    expect(input('first').value).toBe('Jordan');
    input('last').value = 'Singh';
    expect(fillForm(document, rules).filled).toBe(0);
    expect(undoFill().filled).toBe(0);
    expect(input('last').value).toBe('Singh');
  });
  it('undoes only this module’s unchanged values', () => {
    document.body.innerHTML =
      '<input aria-label="First name" id="first"><input aria-label="Last name" id="last">';
    fillForm(document, rules);
    input('last').value = 'User edit';
    const report = undoFill();
    expect(report.filled).toBe(1);
    expect(report.skipped).toBe(1);
    expect(input('first').value).toBe('');
    expect(input('last').value).toBe('User edit');
  });
  it('supports aria-labelledby, placeholder and machine-name fallbacks', () => {
    document.body.innerHTML =
      '<span id="label">First name</span><input aria-labelledby="label" id="first"><input placeholder="Last name" id="last"><input name="expectedCompensation" id="pay">';
    expect(fillForm(document, rules).filled).toBe(3);
    expect(input('pay').value).toBe('1200000');
  });
  it('never derives a label from an entire form or nearby other questions', () => {
    document.body.innerHTML =
      '<form><label for="first">First name</label><input id="first"><p>Expected compensation</p><input id="unknown"></form>';
    expect(fillForm(document, rules).filled).toBe(1);
    expect(input('unknown').value).toBe('');
  });
  it('ignores hidden, read-only, disabled, password, payment, consent and upload controls', () => {
    document.body.innerHTML =
      '<input aria-label="First name" id="hidden" hidden><div style="display:none"><input aria-label="First name" id="csshidden"></div><input aria-label="First name" id="disabled" disabled><input aria-label="First name" id="readonly" readonly><input aria-label="First name" id="password" type="password"><input aria-label="First name" id="file" type="file"><input aria-label="First name" id="credit" autocomplete="cc-number"><label>Do you agree to terms?<input id="agree"></label><input aria-label="Bank account number" id="bank"><input aria-label="First name" type="checkbox" id="check">';
    const dangerous = [
      ...rules,
      field('agree', 'Do you agree to terms', 'yes'),
      field('bank', 'Bank account number', '123'),
    ];
    expect(fillForm(document, dangerous).filled).toBe(0);
    expect(
      scanForm(document, dangerous).questions.every((question) => question.kind === 'file'),
    ).toBe(true);
  });
  it('selects a unique native option and preserves an existing choice', () => {
    document.body.innerHTML =
      '<label for="relocate">Willing to relocate</label><select id="relocate"><option value="">Select</option><option value="yes">Yes</option><option value="no">No</option></select><label for="other">Other question</label><select id="other"><option value="no" selected>No</option><option value="yes">Yes</option></select>';
    const choices = [
      field('relocate', 'Willing to relocate', 'Yes'),
      field('other', 'Other question', 'Yes'),
    ];
    expect(fillForm(document, choices).filled).toBe(1);
    expect(input('relocate').value).toBe('yes');
    expect(input('other').value).toBe('no');
    undoFill();
    expect(input('relocate').value).toBe('');
  });
  it('does not guess dropdown options using broad substring matches', () => {
    document.body.innerHTML =
      '<select aria-label="Willing to relocate" id="relocate"><option value="">Select</option><option>Yes, within India</option><option>Yes, internationally</option></select>';
    const report = fillForm(document, [field('relocate', 'Willing to relocate', 'Yes')]);
    expect(report.filled).toBe(0);
    expect(report.questions[0].reason).toMatch('unique');
  });
  it.each(['— Make a Selection —', 'PLEASE SELECT', 'Choose an option…', '— Select a value —'])(
    'fills a native dropdown whose placeholder has a nonempty value: %s',
    (placeholder) => {
      document.body.innerHTML = `<label for="prefix">Prefix</label><select id="prefix"><option value="-1">${placeholder}</option><option value="20">Ms. / Miss / Mrs.</option><option value="21">Mr.</option><option value="22">Other</option></select>`;
      const saved = [field('prefix', 'prefix*', 'mR')];
      expect(scanForm(document, saved).questions[0]).toMatchObject({
        filled: false,
        matchedField: 'prefix',
      });
      const events = vi.fn();
      input('prefix').addEventListener('change', events);
      expect(fillForm(document, saved).filled).toBe(1);
      expect(input('prefix').value).toBe('21');
      expect(events).toHaveBeenCalledOnce();
      expect(fillForm(document, saved).filled).toBe(0);
      undoFill();
      expect(input('prefix').value).toBe('-1');
    },
  );
  it.each(['None', 'Other', 'Prefer not to disclose', 'No', '0'])(
    'preserves a real native choice labelled %s',
    (label) => {
      document.body.innerHTML = `<select id="choice" aria-label="Custom question"><option value="existing">${label}</option><option value="new">Saved answer</option></select>`;
      expect(fillForm(document, [field('choice', 'Custom question', 'Saved answer')]).filled).toBe(
        0,
      );
      expect(input('choice').value).toBe('existing');
    },
  );
  it.each([
    '<option value="21" disabled>Mr.</option>',
    '<optgroup disabled><option value="21">Mr.</option></optgroup>',
    '<option value="21">Mr.</option><option value="22">MR</option>',
  ])('leaves unavailable or ambiguous native choices unchanged: %s', (options) => {
    document.body.innerHTML = `<select aria-label="Prefix" id="prefix"><option value="-1">— Make a Selection —</option>${options}</select>`;
    const report = fillForm(document, [field('prefix', 'prefix*', 'mr.')]);
    expect(report.filled).toBe(0);
    expect(report.questions[0].reason).toContain('unique dropdown');
    expect(input('prefix').value).toBe('-1');
  });
  it('does not erase meaningful option words when comparing answers', () => {
    document.body.innerHTML =
      '<select aria-label="Working arrangement" id="choice"><option value="-1">Choose an option</option><option value="1">Travel required</option><option value="2">Travel optional</option></select>';
    expect(
      fillForm(document, [field('choice', 'Working arrangement', 'Travel required')]).filled,
    ).toBe(1);
    expect(input('choice').value).toBe('1');
  });
  it('uses native selection for a select with an explicit combobox role', () => {
    document.body.innerHTML =
      '<select role="combobox" aria-label="Prefix" id="prefix"><option value="-1">— Make a Selection —</option><option value="1">Mr.</option></select>';
    const saved = [field('prefix', 'prefix*', 'MR')];
    expect(scanForm(document, saved).questions[0].kind).toBe('select');
    expect(fillForm(document, saved).filled).toBe(1);
    expect(input('prefix').value).toBe('1');
  });
  it('treats a radio group as one question, matches option label, preserves existing choice', () => {
    document.body.innerHTML =
      '<fieldset><legend>Willing to relocate?</legend><label>Yes<input id="yes" type="radio" name="relocation" value="1"></label><label>No<input id="no" type="radio" name="relocation" value="0"></label></fieldset>';
    const choices = [field('relocate', 'Willing to relocate', 'Yes')];
    expect(scanForm(document, choices).questions).toHaveLength(1);
    expect(fillForm(document, choices).filled).toBe(1);
    expect(input('yes').checked).toBe(true);
    expect(fillForm(document, choices).filled).toBe(0);
    undoFill();
    expect(input('yes').checked).toBe(false);
  });
  it('scans new dynamic fields and open shadow DOM', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const shadow = document.getElementById('host')!.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<label for="first">First name</label><input id="first">';
    expect(fillForm(document, rules).filled).toBe(1);
    expect(shadow.querySelector('input')!.value).toBe('Alex');
    document.body.insertAdjacentHTML('beforeend', '<input id="last" aria-label="Last name">');
    expect(fillForm(document, rules).filled).toBe(1);
    expect(input('last').value).toBe('Chen');
  });
  it('uses native setters instead of framework-installed value overrides', () => {
    document.body.innerHTML = '<input id="first" aria-label="First name">';
    const override = vi.fn();
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    Object.defineProperty(input('first'), 'value', {
      get: native.get,
      set: override,
      configurable: true,
    });
    expect(fillForm(document, rules).filled).toBe(1);
    expect(override).not.toHaveBeenCalled();
    expect(input('first').value).toBe('Alex');
  });
  it('rejects formatted salary in numeric controls and leaves custom comboboxes for review', () => {
    document.body.innerHTML =
      '<input type="number" aria-label="Expected compensation" id="salary"><input role="combobox" aria-label="First name" id="combo">';
    const report = fillForm(document, [
      field('salary', 'Expected compensation', '₹12 lakh'),
      rules[0],
    ]);
    expect(report.filled).toBe(0);
    expect(report.questions.map((item) => item.reason).join(' ')).toMatch('numeric');
    expect(report.questions.map((item) => item.reason).join(' ')).toMatch('select this dropdown');
  });
  it('does not submit forms while filling', () => {
    document.body.innerHTML =
      '<form id="form"><input aria-label="First name" id="first"><button type="submit">Submit</button><input type="submit" value="First name"></form>';
    const submit = vi.fn();
    document.getElementById('form')!.addEventListener('submit', submit);
    expect(fillForm(document, rules).filled).toBe(1);
    expect(submit).not.toHaveBeenCalled();
  });
  it('only recognizes job context for automatic filling', () => {
    const mockDocument = (url: string) =>
      ({ location: { href: url }, querySelectorAll: () => [] }) as unknown as Document;
    expect(isJobContext(mockDocument('https://careers.example.com/apply'))).toBe(true);
    expect(isJobContext(mockDocument('https://jobs.ashbyhq.com/company'))).toBe(true);
    expect(isJobContext(mockDocument('https://bank.example.com/profile'))).toBe(false);
    expect(isJobContext(mockDocument('https://www.linkedin.com/feed'))).toBe(false);
    expect(
      isJobContext({
        location: { href: 'about:blank' },
        referrer: 'https://careers.example.com/apply',
        querySelectorAll: () => [],
      } as unknown as Document),
    ).toBe(true);
  });
  it('recognizes a visible application modal on a generic talent opportunities route', () => {
    window.history.replaceState(null, '', '/talent/all-opportunities');
    try {
      document.body.innerHTML =
        '<div role="dialog"><h4>Apply to Research Engineer at Example Company</h4><form><p>Your resume</p><button type="button">Upload New Resume</button><input aria-label="Current CTC"><input aria-label="Expected CTC"><input aria-label="LinkedIn Profile"></form></div>';
      expect(isJobContext(document)).toBe(true);
      document.querySelector('[role="dialog"]')!.setAttribute('hidden', '');
      expect(isJobContext(document)).toBe(false);
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
  it('requires application evidence rather than treating any three-input modal as a job form', () => {
    document.body.innerHTML =
      '<div role="dialog"><h4>Apply to our newsletter</h4><form><input><input><input></form></div>';
    expect(isJobContext(document)).toBe(false);
  });
});

describe('content script lifecycle', () => {
  it('respects cleared answers during background fill but retries them on an explicit Fill click', async () => {
    const { getAutofillData } = await import('../src/storage');
    const { startContent } = await import('../src/content');
    const notice = [field('notice', 'Notice period', '7')];
    vi.mocked(getAutofillData).mockResolvedValue({ fields: notice, autoFill: false });
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test',
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    });
    document.body.innerHTML = `<input id="notice" aria-label="Notice period">
      <select id="select" aria-label="Notice period"><option value="">Choose an option</option><option value="7">7</option></select>
      <div id="editable" contenteditable="true" role="textbox" aria-label="Notice period"></div>`;
    const registration = vi.spyOn(document, 'addEventListener');
    const cleanup = startContent();
    try {
      // jsdom cannot emit trusted input events. Exercise the actual registered
      // listener with a trusted event envelope, leaving production trust checks intact.
      const listener = registration.mock.calls.find(
        ([type]) => type === 'input',
      )![1] as EventListener;
      for (const id of ['notice', 'select', 'editable'])
        listener({
          isTrusted: true,
          composedPath: () => [document.getElementById(id)],
        } as unknown as Event);
      expect(fillForm(document, notice, '', true).filled).toBe(0);
      expect(
        scanForm(document, notice).questions.every((question) =>
          question.reason?.includes('click Fill this page'),
        ),
      ).toBe(true);
      expect((await fillFormWithWidgets(document, notice)).filled).toBe(3);
      expect(input('notice').value).toBe('7');
      expect((document.getElementById('select') as HTMLSelectElement).value).toBe('7');
      expect(document.getElementById('editable')!.textContent).toBe('7');
      input('notice').value = '14';
      listener({ isTrusted: true, composedPath: () => [input('notice')] } as unknown as Event);
      expect(fillForm(document, notice).filled).toBe(0);
      expect(input('notice').value).toBe('14');
    } finally {
      cleanup();
      registration.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it('does not carry an edit block into a different question on a reused SPA input', async () => {
    const { getAutofillData } = await import('../src/storage');
    const { startContent } = await import('../src/content');
    vi.mocked(getAutofillData).mockResolvedValue({ fields: rules, autoFill: false });
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test',
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    });
    document.body.innerHTML =
      '<form aria-label="Job application"><input id="reused" aria-label="First name"></form>';
    const registration = vi.spyOn(document, 'addEventListener');
    const cleanup = startContent();
    try {
      const listener = registration.mock.calls.find(
        ([type]) => type === 'input',
      )![1] as EventListener;
      listener({ isTrusted: true, composedPath: () => [input('reused')] } as unknown as Event);
      expect(fillForm(document, rules, '', true).filled).toBe(0);
      input('reused').setAttribute('aria-label', 'Last name');
      expect(fillForm(document, rules, '', true).filled).toBe(1);
      expect(input('reused').value).toBe('Chen');
    } finally {
      cleanup();
      registration.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it('starts filling immediately after the saved Auto fill toggle is enabled', async () => {
    vi.useFakeTimers();
    const { getAutofillData } = await import('../src/storage');
    const { startContent } = await import('../src/content');
    vi.mocked(getAutofillData).mockResolvedValue({ fields: rules, autoFill: false });
    let changed: (changes: unknown, area: string) => void = () => {};
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test',
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        onChanged: { addListener: (fn: typeof changed) => (changed = fn), removeListener: vi.fn() },
      },
    });
    window.history.replaceState(null, '', '/jobs/apply');
    document.body.innerHTML = '<input id="first" aria-label="First name">';
    const cleanup = startContent();
    try {
      await vi.advanceTimersByTimeAsync(500);
      expect(input('first').value).toBe('');
      vi.mocked(getAutofillData).mockResolvedValue({ fields: rules, autoFill: true });
      changed({}, 'local');
      await vi.advanceTimersByTimeAsync(500);
      expect(input('first').value).toBe('Alex');
    } finally {
      cleanup();
      vi.unstubAllGlobals();
      vi.useRealTimers();
      window.history.replaceState(null, '', '/');
    }
  });
  it('registers its frame, autofills dynamic job questions and pauses after undo', async () => {
    vi.useFakeTimers();
    const { getAutofillData } = await import('../src/storage');
    const { startContent } = await import('../src/content');
    vi.mocked(getAutofillData).mockResolvedValue({ fields: rules, autoFill: true });
    const listeners: ((
      message: unknown,
      sender: unknown,
      respond: (report: unknown) => void,
    ) => unknown)[] = [];
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test-extension',
        sendMessage,
        onMessage: {
          addListener: (fn: (typeof listeners)[number]) => listeners.push(fn),
          removeListener: vi.fn(),
        },
      },
      storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    });
    window.history.replaceState(null, '', '/jobs/apply');
    document.body.innerHTML = '<input id="first" aria-label="First name">';
    const cleanup = startContent();
    try {
      await vi.advanceTimersByTimeAsync(500);
      expect(input('first').value).toBe('Alex');
      expect(sendMessage).toHaveBeenCalledWith({ type: 'eze-custom:ready' });
      document.body.insertAdjacentHTML('beforeend', '<input id="last" aria-label="Last name">');
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);
      expect(input('last').value).toBe('Chen');
      await new Promise<void>((resolve) =>
        listeners[0]({ type: 'eze-custom:undo' }, {}, () => resolve()),
      );
      expect(input('first').value).toBe('');
      document.body.append(document.createElement('div'));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);
      expect(input('first').value).toBe('');
    } finally {
      cleanup();
      vi.unstubAllGlobals();
      vi.useRealTimers();
      window.history.replaceState(null, '', '/');
    }
  });
  it('stops on new questions when disabled, keeps manual fill available, and resumes after undo when explicitly enabled', async () => {
    vi.useFakeTimers();
    const { getAutofillData } = await import('../src/storage');
    const { startContent } = await import('../src/content');
    vi.mocked(getAutofillData).mockResolvedValue({ fields: rules, autoFill: true });
    let changed: (changes: any, area: string) => void = () => {};
    let receive: (
      message: unknown,
      sender: unknown,
      respond: (report: unknown) => void,
    ) => unknown = () => {};
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test',
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
        onMessage: { addListener: (fn: typeof receive) => (receive = fn), removeListener: vi.fn() },
      },
      storage: {
        onChanged: { addListener: (fn: typeof changed) => (changed = fn), removeListener: vi.fn() },
      },
    });
    window.history.replaceState(null, '', '/jobs/apply');
    document.body.innerHTML = '<input id="first" aria-label="First name">';
    const cleanup = startContent();
    const setting = (enabled: boolean, old: boolean) => {
      vi.mocked(getAutofillData).mockResolvedValue({ fields: rules, autoFill: enabled });
      changed(
        {
          [STORAGE_KEY]: {
            oldValue: { profiles: { local: { autoFill: old } } },
            newValue: { profiles: { local: { autoFill: enabled } } },
          },
        },
        'local',
      );
    };
    try {
      await vi.advanceTimersByTimeAsync(500);
      expect(input('first').value).toBe('Alex');
      setting(false, true);
      document.body.insertAdjacentHTML('beforeend', '<input id="last" aria-label="Last name">');
      await vi.advanceTimersByTimeAsync(600);
      expect(input('last').value).toBe('');
      const manual = new Promise((resolve) => receive({ type: 'eze-custom:fill' }, {}, resolve));
      await vi.advanceTimersByTimeAsync(10);
      expect(((await manual) as { filled: number }).filled).toBe(1);
      expect(input('last').value).toBe('Chen');
      await new Promise((resolve) => receive({ type: 'eze-custom:undo' }, {}, resolve));
      expect(input('last').value).toBe('');
      setting(true, false);
      await vi.advanceTimersByTimeAsync(500);
      expect(input('first').value).toBe('Alex');
      expect(input('last').value).toBe('Chen');
    } finally {
      cleanup();
      vi.unstubAllGlobals();
      vi.useRealTimers();
      window.history.replaceState(null, '', '/');
    }
  });
  it('fills a job application on a generic forms route while ignoring chat, search and unrelated sibling forms', async () => {
    vi.useFakeTimers();
    const { getAutofillData } = await import('../src/storage');
    const { startContent } = await import('../src/content');
    vi.mocked(getAutofillData).mockResolvedValue({ fields: rules, autoFill: true });
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test',
        sendMessage: vi.fn().mockResolvedValue({ ok: true }),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    });
    window.history.replaceState(null, '', '/forms/123');
    document.body.innerHTML =
      '<form aria-label="Job application"><input id="first" aria-label="First name"></form><form aria-label="Contact us"><input id="contact" aria-label="First name"></form><div class="chat-composer"><input id="chat" aria-label="First name"></div><input id="search" type="search" aria-label="First name">';
    const cleanup = startContent();
    try {
      await vi.advanceTimersByTimeAsync(600);
      expect(input('first').value).toBe('Alex');
      for (const id of ['contact', 'chat', 'search']) expect(input(id).value).toBe('');
    } finally {
      cleanup();
      vi.unstubAllGlobals();
      vi.useRealTimers();
      window.history.replaceState(null, '', '/');
    }
  });
});
