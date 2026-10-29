// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  aiFields,
  applyAIAnswer,
  isAIFormContext,
  isJobContext,
  scanForm,
  startContent,
  undoFill,
} from '../src/content';
beforeEach(() => {
  document.body.innerHTML = '';
  document.title = 'Job application';
  history.replaceState({}, '', '/careers/apply');
  undoFill();
});
afterEach(() => {
  document.title = '';
  history.replaceState({}, '', '/');
});
describe('reviewed AI answer application', () => {
  it('uses associated labels, honors maxlength, emits framework events and supports Undo', () => {
    document.body.innerHTML =
      '<label for="answer">Why are you interested in this role?</label><textarea id="answer" maxlength="100"></textarea>';
    const [field] = aiFields();
    expect(field.maxLength).toBe(100);
    let inputs = 0,
      changes = 0;
    field.element.addEventListener('input', () => inputs++);
    field.element.addEventListener('change', () => changes++);
    applyAIAnswer(field, 'I enjoy solving practical problems.', '');
    expect((field.element as HTMLTextAreaElement).value).toBe(
      'I enjoy solving practical problems.',
    );
    expect(inputs).toBe(1);
    expect(changes).toBe(1);
    undoFill();
    expect((field.element as HTMLTextAreaElement).value).toBe('');
  });
  it('does not overwrite typing that occurred while an AI request was pending', () => {
    document.body.innerHTML = '<label>Why this role?<textarea></textarea></label>';
    const [field] = aiFields();
    (field.element as HTMLTextAreaElement).value = 'My new answer';
    expect(() => applyAIAnswer(field, 'AI draft', '')).toThrow('changed');
    expect((field.element as HTMLTextAreaElement).value).toBe('My new answer');
  });
  it('rejects detached/read-only targets and overlength drafts', () => {
    document.body.innerHTML = '<label>Why this role?<textarea maxlength="5"></textarea></label>';
    const [field] = aiFields();
    expect(() => applyAIAnswer(field, 'Too much text', '')).toThrow('limit');
    (field.element as HTMLTextAreaElement).readOnly = true;
    expect(() => applyAIAnswer(field, 'Short', '')).toThrow('editable');
    field.element.remove();
    expect(() => applyAIAnswer(field, 'Short', '')).toThrow('editable');
  });
  it('excludes secrets, consents, identity and numeric questions while allowing open-ended support questions', () => {
    document.body.innerHTML =
      '<label>Password<textarea></textarea></label><label>Current CTC<input></label><label>If yes, please advise what support is needed:<textarea></textarea></label><label>Why this role?<textarea hidden></textarea></label>';
    expect(aiFields().map((field) => field.question)).toEqual([
      'If yes, please advise what support is needed:',
    ]);
  });
  it('excludes mobile/contact-number variants and telephone/numeric metadata without blocking mobile-project narratives', () => {
    document.body.innerHTML =
      '<label>Mobile Number*<input></label><label>Contact No.<input></label><label>Telephone number<input></label><label>Cellular number<input></label><label>WhatsApp number<input></label><label>How would you describe your contact details?<input autocomplete="tel-national"></label><label>Additional details<input inputmode="tel"></label><label>Additional details<input inputmode="numeric"></label><label>Describe a mobile app you built<textarea></textarea></label>';
    expect(aiFields().map((field) => field.question)).toEqual(['Describe a mobile app you built']);
    expect(
      scanForm(document, [])
        .questions.filter((question) => question.canDraftWithAI)
        .map((question) => question.label),
    ).toEqual(['Describe a mobile app you built']);
  });
  it('offers AI for Google Forms-style project questions, including name/years wording in a narrative', () => {
    history.replaceState({}, '', '/forms/d/e/example/viewform');
    document.body.innerHTML = `<form>
      <div role="heading">AI Engineer application form</div>
      <div role="listitem"><div id="q1">Describe the best AI agent or LLM project you have built. Name the actual tools and models.</div>
        <div id="help1">Minimum 4–5 sentences. Maximum 150 words.</div><input aria-labelledby="q1" aria-describedby="help1"></div>
      <div id="q2">What was the hardest problem in that project, and exactly how did you solve it?</div><input aria-labelledby="q2">
      <label>Describe your experience over the last 3 years<textarea></textarea></label>
      <label>What is your name?*<input></label><label>College or Institution name<input></label><label>Notice period<input></label>
    </form>`;
    expect(isJobContext(document)).toBe(false);
    expect(isAIFormContext(document)).toBe(true);
    const fields = aiFields();
    expect(fields).toHaveLength(3);
    expect(fields[0].instructions).toContain('Maximum 150 words');
    const report = scanForm(document, []);
    expect(
      report.questions
        .filter((question) => question.canDraftWithAI)
        .map((question) => question.label),
    ).toEqual(fields.map((field) => field.question));
  });
  it('rejects a reviewed draft if a reused input now asks a different question', () => {
    document.body.innerHTML = '<label id="question">Why this role?<textarea></textarea></label>';
    const [field] = aiFields();
    document.querySelector('label')!.firstChild!.textContent = 'Describe your best project';
    expect(() => applyAIAnswer(field, 'Old answer', '')).toThrow('question changed');
  });
  it('opens only the current eligible question from the sidebar message, without generating', async () => {
    document.body.innerHTML =
      '<label>Describe your best project<input></label><label>Current CTC<input></label>';
    const report = scanForm(document, []);
    const listeners: ((
      message: unknown,
      sender: unknown,
      respond: (value: unknown) => void,
    ) => unknown)[] = [];
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'test',
        sendMessage,
        onMessage: {
          addListener: (fn: (typeof listeners)[number]) => listeners.push(fn),
          removeListener: vi.fn(),
        },
      },
      storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
    });
    const open = vi.fn().mockResolvedValue(true),
      cleanup = startContent({ open });
    const send = (questionId: string, questionLabel: string) =>
      new Promise<any>((resolve) =>
        listeners[0]({ type: 'eze-custom:open-ai', questionId, questionLabel }, {}, resolve),
      );
    try {
      expect(await send(report.questions[0].id, report.questions[0].label)).toEqual({ ok: true });
      expect(open).toHaveBeenCalledWith(document.querySelector('input'));
      expect((await send(report.questions[0].id, 'A different question')).error).toContain(
        'changed',
      );
      expect((await send(report.questions[1].id, report.questions[1].label)).error).toContain(
        'no longer editable',
      );
      expect(open).toHaveBeenCalledTimes(1);
      expect(sendMessage.mock.calls.some(([message]) => message.type === 'eze-ai:generate')).toBe(
        false,
      );
    } finally {
      cleanup();
      vi.unstubAllGlobals();
    }
  });
  it('omits sidebar AI actions and rejects stale drafts when an application becomes a chat', () => {
    document.body.innerHTML =
      '<form><label>Describe your project<textarea></textarea></label></form>';
    const [field] = aiFields();
    expect(scanForm(document, []).questions[0].canDraftWithAI).toBe(true);
    history.replaceState({}, '', '/messages');
    document.title = 'Messages';
    expect(aiFields()).toEqual([]);
    expect(scanForm(document, []).questions[0].canDraftWithAI).toBeUndefined();
    expect(() => applyAIAnswer(field, 'A stale application answer', '')).toThrow(
      'no longer editable',
    );
    expect((field.element as HTMLTextAreaElement).value).toBe('');
  });
});
