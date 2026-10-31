import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editSettings, publicSettings } from '../src/ai/config';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});
afterEach(() => vi.unstubAllGlobals());

describe('private AI settings persistence across worker reloads', () => {
  it('retains committed provider keys after the worker module restarts and unrelated preferences change', async () => {
    const firstWorker = await import('../src/ai/store');
    await firstWorker.updateAISettings((current) =>
      editSettings(current, {
        kind: 'provider',
        provider: 'openai',
        apiKey: 'synthetic-reload-secret',
      }),
    );
    vi.resetModules();
    const nextWorker = await import('../src/ai/store');
    expect((await nextWorker.readCommittedAISettings()).providers.openai.apiKey).toBe(
      'synthetic-reload-secret',
    );
    await nextWorker.updateAISettings((current) =>
      editSettings(current, {
        kind: 'general',
        selectedProvider: 'anthropic',
        background: 'Synthetic résumé context.',
      }),
    );
    vi.resetModules();
    const thirdWorker = await import('../src/ai/store');
    const saved = await thirdWorker.readCommittedAISettings();
    expect(saved.providers.openai.apiKey).toBe('synthetic-reload-secret');
    expect(saved.background).toBe('Synthetic résumé context.');
    expect(JSON.stringify(publicSettings(saved))).not.toContain('synthetic-reload-secret');
  });
  it('keeps the last committed key when an edit fails and allows a later edit to succeed', async () => {
    const store = await import('../src/ai/store');
    await store.updateAISettings((current) =>
      editSettings(current, {
        kind: 'provider',
        provider: 'openai',
        apiKey: 'synthetic-original-secret',
      }),
    );
    await expect(
      store.updateAISettings(() => {
        throw new Error('Save interrupted.');
      }),
    ).rejects.toThrow('Save interrupted');
    expect((await store.readCommittedAISettings()).providers.openai.apiKey).toBe(
      'synthetic-original-secret',
    );
    await store.updateAISettings((current) =>
      editSettings(current, { kind: 'general', smart: true }),
    );
    expect((await store.readCommittedAISettings()).providers.openai.apiKey).toBe(
      'synthetic-original-secret',
    );
  });
});
