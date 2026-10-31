import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readAISettings } from '../src/ai/store';
import { installAIBackground } from '../src/ai/background';
const generate = vi.hoisted(() => vi.fn());
vi.mock('../src/ai/generation', async (original) => ({
  ...(await original<object>()),
  generateDraft: generate,
}));
const listeners: ((...args: any[]) => any)[] = [];
const settingsSender = {
  id: 'extension-test',
  url: 'chrome-extension://extension-test/ai-settings.html',
};
const pageSender = {
  id: 'extension-test',
  url: 'https://example.test/apply',
  tab: { id: 4 },
  frameId: 0,
};
async function send(message: unknown, sender: unknown = settingsSender): Promise<any> {
  return new Promise((resolve) => {
    for (const listener of listeners) listener(message, sender, resolve);
  });
}
beforeEach(() => {
  listeners.length = 0;
  generate.mockReset();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'extension-test',
      getURL: (path: string) => `chrome-extension://extension-test/${path}`,
      onMessage: { addListener: (fn: any) => listeners.push(fn) },
      onConnect: { addListener: vi.fn() },
    },
    tabs: { create: vi.fn(), onRemoved: { addListener: vi.fn() } },
    storage: {
      local: { get: vi.fn(async () => ({ profile: { nameData: { firstName: 'Example' } } })) },
    },
  });
  installAIBackground();
});
afterEach(() => vi.unstubAllGlobals());
describe('AI background trust and persistence', () => {
  it('persists keys in private IndexedDB and returns only configured state', async () => {
    const saved = await send({
      type: 'eze-ai:edit',
      action: { kind: 'provider', provider: 'openai', apiKey: 'test-private-key' },
    });
    expect(saved.settings.providers.openai.hasKey).toBe(true);
    expect(JSON.stringify(saved)).not.toContain('test-private-key');
    expect((await readAISettings()).providers.openai.apiKey).toBe('test-private-key');
    expect(JSON.stringify(await send({ type: 'eze-ai:status' }, pageSender))).not.toContain(
      'test-private-key',
    );
  });
  it('reports saved background separately from missing provider setup and waits for queued saves', async () => {
    const background = 'Private synthetic résumé context.';
    const saving = send({ type: 'eze-ai:edit', action: { kind: 'general', background } });
    const status = await send({ type: 'eze-ai:status' }, pageSender);
    await saving;
    expect(status).toMatchObject({
      configured: false,
      hasBackground: true,
      backgroundCharacters: background.length,
    });
    expect(status.issue).toContain('API key');
    expect(JSON.stringify(status)).not.toContain(background);
  });
  it('keeps a saved key when a provider rejects a model refresh', async () => {
    await send({
      type: 'eze-ai:edit',
      action: { kind: 'provider', provider: 'openai', apiKey: 'synthetic-rejected-key' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    const result = await send({ type: 'eze-ai:models', provider: 'openai', force: true });
    expect(result.live).toBe(false);
    expect(result.settings.providers.openai.hasKey).toBe(true);
    expect((await readAISettings()).providers.openai.apiKey).toBe('synthetic-rejected-key');
    expect(JSON.stringify(result)).not.toContain('synthetic-rejected-key');
  });
  it('rejects settings access and mutations from content scripts and external senders', async () => {
    for (const sender of [
      pageSender,
      { id: 'other', url: settingsSender.url },
      { id: 'extension-test', url: 'chrome-extension://extension-test/arbitrary.html' },
    ]) {
      expect((await send({ type: 'eze-ai:settings' }, sender)).error).toBeTruthy();
      expect(
        (
          await send(
            {
              type: 'eze-ai:edit',
              action: { kind: 'provider', provider: 'openai', apiKey: 'attacker-key' },
            },
            sender,
          )
        ).error,
      ).toBeTruthy();
    }
    expect((await readAISettings()).providers.openai.apiKey).toBe('');
  });
  it('rejects prototype provider keys and serializes edits to separate providers', async () => {
    const bad = await send({
      type: 'eze-ai:edit',
      action: { kind: 'provider', provider: '__proto__', apiKey: 'bad' },
    });
    expect(bad.error).toBeTruthy();
    await Promise.all(
      ['openai', 'anthropic'].map((provider) =>
        send({
          type: 'eze-ai:edit',
          action: { kind: 'provider', provider, apiKey: `test-${provider}` },
        }),
      ),
    );
    const settings = await readAISettings();
    expect(settings.providers.openai.apiKey).toBe('test-openai');
    expect(settings.providers.anthropic.apiKey).toBe('test-anthropic');
  });
  it('limits concurrent requests per tab and cancels only the requesting frame’s generation', async () => {
    let signal: AbortSignal;
    generate.mockImplementation(
      (_s: unknown, _r: unknown, _f: unknown, abort: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal = abort;
          abort.addEventListener('abort', () => reject(new Error('Generation cancelled.')));
        }),
    );
    const pending = send(
      { type: 'eze-ai:generate', id: 'request-1', request: { question: 'Why this role?' } },
      pageSender,
    );
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    expect(
      (
        await send(
          { type: 'eze-ai:generate', id: 'request-2', request: { question: 'Other question?' } },
          pageSender,
        )
      ).error,
    ).toContain('current answer');
    await send({ type: 'eze-ai:cancel', id: 'request-1' }, { ...pageSender, frameId: 3 });
    expect(signal!.aborted).toBe(false);
    await send({ type: 'eze-ai:cancel', id: 'request-1' }, pageSender);
    expect((await pending).error).toContain('cancelled');
  });
});
