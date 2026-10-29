import { describe, it, expect, vi } from 'vitest';
import {
  defaults,
  editSettings,
  publicSettings,
  normalizeEndpoint,
  type Provider,
} from '../src/ai/config';
import { complete, listModels } from '../src/ai/providers';
import { answerLimits, generateDraft, validateDraftRequest } from '../src/ai/generation';
import { applicantFacts } from '../src/ai/facts';
import { STORAGE_KEY } from '../src/types';
const config = () => ({ ...defaults().providers.openai, apiKey: 'test-only-secret' });
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('AI provider configuration and key boundaries', () => {
  it('keeps separate provider credentials and hides every credential in UI responses', () => {
    let settings = editSettings(defaults(), {
      kind: 'provider',
      provider: 'openai',
      apiKey: 'openai-secret',
    });
    settings = editSettings(settings, {
      kind: 'provider',
      provider: 'anthropic',
      apiKey: 'anthropic-secret',
    });
    settings = editSettings(settings, {
      kind: 'general',
      selectedProvider: 'anthropic',
      smart: true,
    });
    expect(settings.providers.openai.apiKey).toBe('openai-secret');
    const visible = publicSettings(settings);
    expect(visible.providers.anthropic.hasKey).toBe(true);
    expect(JSON.stringify(visible)).not.toContain('secret');
    expect(JSON.stringify(visible)).not.toContain('apiKey');
  });
  it('does not transfer a custom key to another endpoint and rejects insecure remote URLs', () => {
    let settings = editSettings(defaults(), {
      kind: 'provider',
      provider: 'custom',
      baseUrl: 'https://one.example/v1',
      apiKey: 'private',
    });
    settings = editSettings(settings, {
      kind: 'provider',
      provider: 'custom',
      baseUrl: 'https://two.example/v1',
    });
    expect(settings.providers.custom.apiKey).toBe('');
    for (const value of [
      'http://example.com/v1',
      'https://key@example.com',
      'https://example.com?key=secret',
      'javascript:alert(1)',
    ])
      expect(() => normalizeEndpoint(value, 'custom')).toThrow();
    expect(normalizeEndpoint('http://127.0.0.1:11434/', 'ollama')).toBe('http://127.0.0.1:11434');
  });
  it('remembers separate tiers, hides choices persistently and restores them without deleting a deployment', () => {
    let settings = editSettings(defaults(), {
      kind: 'model',
      provider: 'custom',
      tier: 'smart',
      id: 'my-deployment',
    });
    settings = editSettings(settings, {
      kind: 'hide-model',
      provider: 'custom',
      id: 'my-deployment',
    });
    expect(settings.providers.custom.smart).toBe('my-deployment');
    expect(settings.providers.custom.hidden).toEqual(['my-deployment']);
    expect(settings.providers.custom.entries).toEqual([]);
    settings = editSettings(settings, {
      kind: 'model',
      provider: 'custom',
      tier: 'fast',
      id: 'my-deployment',
    });
    expect(settings.providers.custom.hidden).toEqual([]);
    expect(() =>
      editSettings(settings, { kind: 'model', provider: 'custom', tier: 'smart', id: 'bad id' }),
    ).toThrow();
  });
});
describe('direct provider adapters', () => {
  it('rejects malformed successful JSON responses without exposing a raw parsing exception', async () => {
    const malformed: [Provider, unknown][] = [
      ['openai', { output: { type: 'message' } }],
      ['anthropic', { content: 'not-an-array' }],
      ['gemini', { candidates: [{ content: { parts: [null, { text: 42 }] } }] }],
      ['ollama', { message: { content: { answer: 'not-text' } } }],
      ['deepseek', { choices: [{ message: { content: 19 } }] }],
    ];
    for (const [provider, payload] of malformed) {
      const saved = {
        ...config(),
        ...(provider === 'ollama' ? { baseUrl: 'http://localhost:11434' } : {}),
      };
      await expect(
        complete(
          provider,
          saved,
          'example-model',
          's',
          'q',
          undefined,
          vi.fn(async () => response(payload)),
        ),
      ).rejects.toThrow('The model returned no answer');
    }
  });
  it('ignores malformed catalog entries while keeping usable provider models', async () => {
    expect(
      await listModels(
        'openai',
        config(),
        vi.fn(async () =>
          response({
            data: [
              null,
              4,
              { id: {} },
              { id: 'gpt-example', display_name: {} },
              { id: 'text-embedding-example' },
            ],
          }),
        ),
      ),
    ).toEqual([{ id: 'gpt-example', label: 'gpt-example' }]);
  });
  it('uses OpenAI Responses without storage, cookies or redirects', async () => {
    const fetcher = vi.fn(async () =>
      response({
        output: [
          { type: 'reasoning', summary: [] },
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{"answer":"Hello","needsInfo":null}' }],
          },
        ],
      }),
    );
    const text = await complete(
      'openai',
      config(),
      'gpt-6-luna',
      'system',
      'question',
      undefined,
      fetcher,
    );
    expect(text).toContain('Hello');
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(request).toMatchObject({ credentials: 'omit', redirect: 'error' });
    expect(JSON.parse(request.body as string)).toMatchObject({
      store: false,
      instructions: 'system',
      input: 'question',
      model: 'gpt-6-luna',
    });
    expect(request.headers).toMatchObject({ Authorization: 'Bearer test-only-secret' });
    expect(request.body).not.toContain('secret');
  });
  it('uses Anthropic headers and content blocks', async () => {
    const fetcher = vi.fn(async () =>
      response({
        content: [
          { type: 'thinking', thinking: 'private' },
          { type: 'text', text: 'answer' },
        ],
      }),
    );
    expect(
      await complete(
        'anthropic',
        { ...config(), workspace: 'wrkspc_example' },
        'claude-test',
        'system',
        'question',
        undefined,
        fetcher,
      ),
    ).toBe('answer');
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.headers).toMatchObject({
      'x-api-key': 'test-only-secret',
      'anthropic-version': '2023-06-01',
      'anthropic-workspace-id': 'wrkspc_example',
    });
    expect(JSON.parse(request.body as string)).toMatchObject({
      system: 'system',
      messages: [{ role: 'user', content: 'question' }],
    });
  });
  it('uses Gemini headers, JSON mode and filters thought parts', async () => {
    const fetcher = vi.fn(async () =>
      response({
        candidates: [
          { content: { parts: [{ text: 'reasoning', thought: true }, { text: 'answer' }] } },
        ],
      }),
    );
    expect(
      await complete(
        'gemini',
        config(),
        'models/gemini-test',
        'system',
        'question',
        undefined,
        fetcher,
      ),
    ).toBe('answer');
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent',
    );
    expect(url).not.toContain('secret');
    expect(request.headers).toMatchObject({ 'x-goog-api-key': 'test-only-secret' });
    expect(JSON.parse(request.body as string).generationConfig.responseMimeType).toBe(
      'application/json',
    );
  });
  it.each([
    ['groq', 'https://api.groq.com/openai/v1/chat/completions'],
    ['cerebras', 'https://api.cerebras.ai/v1/chat/completions'],
    ['deepseek', 'https://api.deepseek.com/chat/completions'],
    ['minimax', 'https://api.minimax.io/v1/chat/completions'],
    ['custom', 'https://custom.example/v1/chat/completions'],
    ['azure', 'https://resource.openai.azure.com/openai/v1/chat/completions'],
  ])('routes %s directly to its configured service', async (provider, expected) => {
    const fetcher = vi.fn(async () => response({ choices: [{ message: { content: 'answer' } }] }));
    const baseUrl =
      provider === 'azure' ? 'https://resource.openai.azure.com' : 'https://custom.example/v1';
    expect(
      await complete(
        provider as Provider,
        { ...config(), baseUrl },
        'model',
        's',
        'q',
        undefined,
        fetcher,
      ),
    ).toBe('answer');
    expect((fetcher.mock.calls[0] as unknown[])[0]).toBe(expected);
    if (provider === 'azure')
      expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({
        'api-key': 'test-only-secret',
      });
  });
  it('supports local Ollama without a key', async () => {
    const fetcher = vi.fn(async () => response({ message: { content: 'answer' } }));
    expect(
      await complete(
        'ollama',
        { ...config(), apiKey: '', baseUrl: 'http://localhost:11434' },
        'llama3.2',
        's',
        'q',
        undefined,
        fetcher,
      ),
    ).toBe('answer');
    expect((fetcher.mock.calls[0] as unknown[])[0]).toBe('http://localhost:11434/api/chat');
  });
  it('does not echo provider error bodies or retry paid requests', async () => {
    const fetcher = vi.fn(async () =>
      response({ error: { message: 'Key test-only-secret is invalid' } }, 401),
    );
    await expect(complete('openai', config(), 'm', 's', 'q', undefined, fetcher)).rejects.toThrow(
      'rejected the API key',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    const fail = vi.fn(async () => {
      throw new TypeError('Network failure at https://user:secret@host');
    });
    await expect(complete('openai', config(), 'm', 's', 'q', undefined, fail)).rejects.toThrow(
      'Could not reach OpenAI',
    );
  });
  it('propagates cancellation without a retry', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(
      complete('openai', config(), 'm', 's', 'q', controller.signal, fetcher),
    ).rejects.toThrow('cancelled');
  });
  it('paginates Gemini catalogs and excludes unsupported models', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          models: [
            { name: 'models/gemini-one', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/embed', supportedGenerationMethods: ['embedContent'] },
          ],
          nextPageToken: 'next',
        }),
      )
      .mockResolvedValueOnce(
        response({
          models: [
            {
              name: 'models/gemini-two',
              displayName: 'Gemini Two',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        }),
      );
    expect(await listModels('gemini', config(), fetcher)).toEqual([
      { id: 'gemini-one', label: 'gemini-one' },
      { id: 'gemini-two', label: 'Gemini Two' },
    ]);
    expect(fetcher.mock.calls[1][0]).toContain('pageToken=next');
  });
  it('lists available OpenAI text models and excludes other modalities and retired models', async () => {
    const fetcher = vi.fn(async () =>
      response({
        data: [
          { id: 'gpt-6.2-sol' },
          { id: 'gpt-image-1' },
          { id: 'whisper-1' },
          { id: 'gpt-4o-audio-preview' },
          { id: 'gpt-retired', shutdown_date: '2020-01-01' },
        ],
      }),
    );
    expect(await listModels('openai', config(), fetcher)).toEqual([
      { id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol' },
    ]);
  });
});
describe('truthful, bounded drafting', () => {
  it('rejects generic input placeholders before any provider generation', () => {
    expect(() => validateDraftRequest({ question: 'Enter Here' })).toThrow('actual form question');
    expect(() => validateDraftRequest({ question: 'Your answer\nMaximum 150 words.' })).toThrow(
      'no AI request',
    );
  });
  const request = validateDraftRequest({
    question: 'Why this role? Maximum 30 words.',
    maxLength: 140,
    context: 'I enjoy solving problems.',
  });
  it('uses field limits and returns a reviewed draft without exposing keys', async () => {
    const settings = defaults();
    settings.providers.openai.apiKey = 'private';
    const generate = vi.fn(
      async () => '{"answer":"I enjoy solving practical problems.","needsInfo":null}',
    );
    const draft = await generateDraft(
      settings,
      request,
      { skills: ['TypeScript'] },
      undefined,
      generate,
    );
    expect(draft).toMatchObject({
      maxLength: 140,
      maxWords: 30,
      warning: '',
      model: settings.providers.openai.fast,
    });
    expect((generate.mock.calls[0] as unknown[])[3]).toContain('UNTRUSTED DATA');
    expect((generate.mock.calls[0] as unknown[])[4]).not.toContain('private');
  });
  it('asks for missing facts rather than filling a contradictory guess', async () => {
    const generate = vi.fn(
      async () =>
        '{"answer":"I am authorized in the US.","needsInfo":"Confirm your work authorization for the US."}',
    );
    expect((await generateDraft(defaults(), request, {}, undefined, generate)).answer).toBe('');
  });
  it('tries one rewrite when too long and blocks an answer still over the limit', async () => {
    const generate = vi.fn(async () =>
      JSON.stringify({ answer: 'Long answer. '.repeat(50), needsInfo: null }),
    );
    const draft = await generateDraft(defaults(), request, {}, undefined, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(draft.warning).toContain('too long');
    expect(draft.answer).not.toHaveLength(140); // never silently truncate a sentence
  });
  it('does not send profile facts when the user disables them', async () => {
    const settings = defaults();
    settings.includeProfile = false;
    const generate = vi.fn(async () => '{"answer":"Example","needsInfo":null}');
    await generateDraft(settings, request, { email: 'private@example.test' }, undefined, generate);
    expect((generate.mock.calls[0] as unknown[])[4]).not.toContain('private@example.test');
  });
  it('includes the saved résumé/background for every question without additional context', async () => {
    const settings = defaults();
    settings.background =
      'Synthetic résumé\nProject: Example Agent\nBuilt with Python and TypeScript.';
    const generate = vi.fn(async () => '{"answer":"Supported example draft.","needsInfo":null}');
    for (const question of [
      'Describe your best project',
      'What problem did you solve in that project?',
    ]) {
      await generateDraft(
        settings,
        validateDraftRequest({ question, context: '' }),
        {},
        undefined,
        generate,
      );
    }
    expect(generate).toHaveBeenCalledTimes(2);
    for (const call of generate.mock.calls) {
      const prompt = JSON.parse((call as unknown[])[4] as string);
      expect(prompt.applicantBackground).toBe(settings.background);
      expect(prompt.additionalContext).toBe('');
    }
  });
  it('rejects malformed output and respects the Smart choice', async () => {
    const settings = defaults();
    settings.smart = true;
    const generate = vi.fn(async () => 'not json');
    await expect(generateDraft(settings, request, {}, undefined, generate)).rejects.toThrow(
      'invalid draft',
    );
    expect((generate.mock.calls[0] as unknown[])[2]).toBe(settings.providers.openai.smart);
  });
  it('extracts explicit character limits independent of user length preference', () => {
    expect(
      answerLimits(
        validateDraftRequest({ question: 'Explain within 80 characters', maxLength: 120 }),
        defaults(),
      ),
    ).toEqual({ maxLength: 80, maxWords: 0 });
  });
});
describe('applicant context', () => {
  it('does not misrepresent the legacy eligibility key as authorization for the US', () => {
    const facts = applicantFacts(
      {
        profile: {
          employmentData: { eligibilityUS: true, sponsorship: true },
          addressData: { country: 'India' },
        },
      },
      'example.test',
    );
    expect(facts.employment).toMatchObject({
      authorizedToWorkInCountryOfResidence: true,
      countryOfResidence: 'India',
    });
    expect(JSON.stringify(facts)).not.toContain('eligibilityUS');
  });

  it('uses only approved profile facts, active-profile/site answers, and excludes account data', () => {
    const data = {
      profile: {
        nameData: { firstName: 'Alex', apiKey: 'never' },
        jobData: [{ title: 'Engineer' }],
        resumeData: { resumeBase64: 'binary' },
      },
      'sb-auth-token': 'never',
      autofillAccount: { accountPassword: 'never' },
      lastSyncProfile: { id: 'a' },
      [STORAGE_KEY]: {
        profiles: {
          a: {
            fields: [
              {
                label: 'Motivation',
                value: 'Build useful products',
                enabled: true,
                scope: 'example.test',
              },
              { label: 'Password', value: 'never', enabled: true },
              { label: 'Other site answer', value: 'never', enabled: true, scope: 'other.test' },
            ],
          },
          b: { fields: [{ label: 'Another profile', value: 'never', enabled: true }] },
        },
      },
    };
    const facts = applicantFacts(data, 'jobs.example.test');
    expect(JSON.stringify(facts)).not.toMatch(/never|binary|Password|apiKey/);
    expect(facts.savedAnswers).toEqual([
      { question: 'Motivation', answer: 'Build useful products' },
    ]);
  });
});
