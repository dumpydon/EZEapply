// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { defaults, publicSettings, editSettings } from '../src/ai/config';
import { mountAISettings } from '../src/ai/settings';
const extract = vi.hoisted(() => vi.fn());
vi.mock('../src/ai/resume-text', () => ({ extractResumePDF: extract }));
let data = defaults();
let host: HTMLElement;
beforeEach(() => {
  data = defaults();
  extract.mockReset();
  document.body.innerHTML = '<main id="settings-test"></main>';
  host = document.querySelector('main')!;
  vi.stubGlobal('chrome', {
    runtime: {
      getURL: (path: string) => `chrome-extension://test/${path}`,
      sendMessage: vi.fn(async (message: any) => {
        if (message.type === 'eze-ai:settings') return { settings: publicSettings(data) };
        if (message.type === 'eze-ai:edit') {
          data = editSettings(data, message.action);
          return { settings: publicSettings(data) };
        }
        if (message.type === 'eze-ai:models')
          return { settings: publicSettings(data), live: true, message: 'Found available models.' };
      }),
    },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent === label,
  )!;
describe('Cue-style AI settings interactions', () => {
  it('saves a provider key, removes it from the visible input and retains only masked state', async () => {
    await mountAISettings(host);
    const key = host.querySelector<HTMLInputElement>('input[type=password]')!;
    key.value = 'secret-test-value';
    button('Save').click();
    await vi.waitFor(() => expect(data.providers.openai.apiKey).toBe('secret-test-value'));
    await vi.waitFor(() => expect(key.value).toBe(''));
    expect(host.textContent).not.toContain('secret-test-value');
    expect(host.innerHTML).not.toContain('secret-test-value');
    expect(key.placeholder).toContain('Saved');
    expect(host.querySelector('.key-state')?.textContent).toContain(
      'kept across extension reloads',
    );
  });
  it('commits a pasted key before Done closes settings and shows saved state after reopening', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    await mountAISettings(host);
    const key = host.querySelector<HTMLInputElement>('input[type=password]')!;
    key.value = 'synthetic-persisted-on-done';
    key.dispatchEvent(new Event('input'));
    expect(host.querySelector('.key-state')?.getAttribute('data-state')).toBe('pending');
    button('Done').click();
    await vi.waitFor(() => expect(close).toHaveBeenCalled());
    expect(data.providers.openai.apiKey).toBe('synthetic-persisted-on-done');
    host.replaceChildren();
    await mountAISettings(host);
    expect(host.querySelector<HTMLInputElement>('input[type=password]')!.value).toBe('');
    expect(host.querySelector('.key-state')?.getAttribute('data-state')).toBe('saved');
    expect(host.innerHTML).not.toContain('synthetic-persisted-on-done');
  });
  it('saves a pasted key when leaving its field or switching providers without sharing it between providers', async () => {
    await mountAISettings(host);
    const key = host.querySelector<HTMLInputElement>('input[type=password]')!;
    key.value = 'synthetic-original';
    key.dispatchEvent(new FocusEvent('blur'));
    await vi.waitFor(() => expect(data.providers.openai.apiKey).toBe('synthetic-original'));
    await vi.waitFor(() => expect(key.value).toBe(''));
    key.value = 'synthetic-replacement';
    button('Anthropic').click();
    await vi.waitFor(() => expect(data.provider).toBe('anthropic'));
    expect(data.providers.openai.apiKey).toBe('synthetic-replacement');
    expect(data.providers.anthropic.apiKey).toBe('');
    button('OpenAI').click();
    await vi.waitFor(() => expect(data.provider).toBe('openai'));
    await vi.waitFor(() =>
      expect(host.querySelector('.key-state')?.getAttribute('data-state')).toBe('saved'),
    );
  });
  it('saves before switching tabs and never treats an empty masked input as a request to remove the key', async () => {
    await mountAISettings(host);
    const key = host.querySelector<HTMLInputElement>('input[type=password]')!;
    key.value = 'synthetic-tab-switch';
    button('✦ Answers').click();
    await vi.waitFor(() => expect(data.providers.openai.apiKey).toBe('synthetic-tab-switch'));
    button('🔑 API Keys').click();
    await vi.waitFor(() => expect(key.value).toBe(''));
    button('Save').click();
    await Promise.resolve();
    expect(data.providers.openai.apiKey).toBe('synthetic-tab-switch');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    button('Remove').click();
    expect(data.providers.openai.apiKey).toBe('synthetic-tab-switch');
  });
  it('keeps the entered replacement and settings open when saving fails', async () => {
    data.providers.openai.apiKey = 'synthetic-existing';
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    await mountAISettings(host);
    const key = host.querySelector<HTMLInputElement>('input[type=password]')!;
    key.value = 'synthetic-replacement';
    const original = vi.mocked(chrome.runtime.sendMessage).getMockImplementation()!;
    vi.mocked(chrome.runtime.sendMessage).mockImplementationOnce(async () => ({
      error: 'Save interrupted.',
    }));
    button('Done').click();
    await vi.waitFor(() =>
      expect(host.querySelector('.status')?.textContent).toContain('Save interrupted'),
    );
    expect(close).not.toHaveBeenCalled();
    expect(data.providers.openai.apiKey).toBe('synthetic-existing');
    expect(key.value).toBe('synthetic-replacement');
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(original);
  });
  it('does not erase a newer key edit when an older save finishes', async () => {
    await mountAISettings(host);
    const key = host.querySelector<HTMLInputElement>('input[type=password]')!;
    let finish!: () => void;
    const original = vi.mocked(chrome.runtime.sendMessage).getMockImplementation()!;
    vi.mocked(chrome.runtime.sendMessage).mockImplementationOnce(async (message: any) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return Reflect.apply(original, undefined, [message]);
    });
    key.value = 'synthetic-first';
    button('Save').click();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    key.value = 'synthetic-newest';
    finish();
    await vi.waitFor(() => expect(data.providers.openai.apiKey).toBe('synthetic-newest'));
    await vi.waitFor(() => expect(key.value).toBe(''));
  });
  it('keeps per-provider model choices and exposes all ten provider controls', async () => {
    await mountAISettings(host);
    expect(host.querySelectorAll('.provider')).toHaveLength(10);
    button('Anthropic').click();
    await vi.waitFor(() => expect(data.provider).toBe('anthropic'));
    await vi.waitFor(() =>
      expect(host.querySelector<HTMLInputElement>('[aria-label="Fast model"]')!.value).toBe(
        data.providers.anthropic.fast,
      ),
    );
    const model = host.querySelector<HTMLInputElement>('[aria-label="Fast model"]')!;
    model.value = 'my-claude-deployment';
    model.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(data.providers.anthropic.fast).toBe('my-claude-deployment'));
    expect(data.providers.openai.fast).toBe('gpt-6-luna');
  });
  it('hides a model, preserves selection, and restores the hidden catalog entry', async () => {
    await mountAISettings(host);
    host.querySelector<HTMLButtonElement>('[aria-label="Choose Fast model"]')!.click();
    document
      .querySelector<HTMLButtonElement>('[aria-label="Remove GPT-6 Luna from choices"]')!
      .click();
    await vi.waitFor(() => expect(data.providers.openai.hidden).toContain('gpt-6-luna'));
    await vi.waitFor(() => expect(button('Restore hidden models (1)')).toBeTruthy());
    expect(data.providers.openai.fast).toBe('gpt-6-luna');
    button('Restore hidden models (1)').click();
    await vi.waitFor(() => expect(data.providers.openai.hidden).toEqual([]));
  });
  it('saves answer preferences independently of provider secrets', async () => {
    await mountAISettings(host);
    button('✦ Answers').click();
    const rules = host.querySelector<HTMLTextAreaElement>('[aria-label="Writing instructions"]')!,
      facts = host.querySelector<HTMLTextAreaElement>('[aria-label="Applicant background"]')!;
    rules.value = 'Use short direct sentences.';
    facts.value = 'Synthetic engineering background.';
    button('Save answer preferences').click();
    await vi.waitFor(() => expect(data.background).toBe(facts.value));
    expect(data.instructions).toBe(rules.value);
  });
  it('automatically saves an imported résumé and reuses it after reopening settings', async () => {
    Object.assign(chrome, {
      storage: {
        local: {
          get: async () => ({
            profile: { resumeData: { resumeBase64: btoa('synthetic PDF bytes') } },
          }),
        },
      },
    });
    extract.mockResolvedValue({
      text: 'Example Applicant\nProjects\nBuilt a useful tool.',
      pagesRead: 1,
      totalPages: 1,
      truncated: false,
      links: 0,
    });
    await mountAISettings(host);
    button('Use saved résumé').click();
    await vi.waitFor(() => expect(data.background).toContain('Projects\nBuilt a useful tool.'));
    expect(host.querySelector('.context-state')?.textContent).toContain('Ready for AI');
    expect(host.querySelector<HTMLDetailsElement>('.background-editor')?.open).toBe(false);
    host.replaceChildren();
    await mountAISettings(host);
    expect(
      host.querySelector<HTMLTextAreaElement>('[aria-label="Applicant background"]')?.value,
    ).toBe(data.background);
    expect(host.querySelector('.context-state')?.textContent).toContain('included automatically');
  });
  it('autosaves pasted background without requiring the Save button', async () => {
    await mountAISettings(host);
    const facts = host.querySelector<HTMLTextAreaElement>('[aria-label="Applicant background"]')!;
    facts.value = 'A reusable synthetic résumé and extra applicant facts.';
    facts.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(data.background).toBe(facts.value), { timeout: 2000 });
    expect(host.querySelector('.context-state')?.textContent).toContain('Ready for AI');
  });
  it('keeps saved background and typed edits when extraction fails or a delayed import becomes stale', async () => {
    data.background = 'Existing saved background.';
    Object.assign(chrome, {
      storage: {
        local: {
          get: async () => ({ profile: { resumeData: { resumeBase64: btoa('synthetic bytes') } } }),
        },
      },
    });
    extract.mockRejectedValueOnce(new Error('No readable text found.'));
    await mountAISettings(host);
    button('Use saved résumé').click();
    await vi.waitFor(() =>
      expect(host.querySelector('.status')?.textContent).toContain('No readable text'),
    );
    expect(data.background).toBe('Existing saved background.');
    let finish!: (value: unknown) => void;
    extract.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    button('Use saved résumé').click();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const facts = host.querySelector<HTMLTextAreaElement>('[aria-label="Applicant background"]')!;
    facts.value = 'New edits typed while the file loaded.';
    facts.dispatchEvent(new Event('input', { bubbles: true }));
    finish({ text: 'Old import result', pagesRead: 1, totalPages: 1, truncated: false, links: 0 });
    await vi.waitFor(() =>
      expect(host.querySelector('.status')?.textContent).toContain('Your edits were kept'),
    );
    expect(facts.value).toBe('New edits typed while the file loaded.');
    await vi.waitFor(() => expect(data.background).toBe(facts.value), { timeout: 2000 });
  });
});
