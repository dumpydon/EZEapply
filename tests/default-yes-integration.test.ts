// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.linkedin.com/jobs/view/4483938057"}
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { installAppBackground } from '../src/app-background';
import { startContent, undoFill } from '../src/content';
import { mountPanel } from '../src/panel';
import { DEFAULT_YES_KEY, STORAGE_KEY } from '../src/types';

const capturedRadio = readFileSync('fixtures/linkedin-radio-group.html', 'utf8');

type MessageListener = (
  ...args: Parameters<Parameters<typeof chrome.runtime.onMessage.addListener>[0]>
) => unknown;

afterEach(() => {
  undoFill();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  history.replaceState({}, '', '/');
});

it('connects the real panel, background preference writer, storage reader and automatic filler', async () => {
  vi.useFakeTimers();
  history.replaceState({}, '', '/jobs/apply');
  const data: Record<string, unknown> = {
    autofillEnabled: true,
    [STORAGE_KEY]: { version: 1, profiles: { local: { fields: [], autoFill: false } } },
  };
  const messages = new Set<MessageListener>();
  const changes = new Set<Parameters<typeof chrome.storage.onChanged.addListener>[0]>();
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'test',
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: {
        addListener: (fn: Parameters<typeof chrome.runtime.onMessage.addListener>[0]) =>
          messages.add(fn),
        removeListener: (fn: Parameters<typeof chrome.runtime.onMessage.addListener>[0]) =>
          messages.delete(fn),
      },
      sendMessage: (message: unknown) =>
        new Promise((resolve) => {
          let handled = false;
          for (const listener of messages)
            if (
              listener(message, { url: 'chrome-extension://test/sidepanel.html' }, resolve) === true
            )
              handled = true;
          if (!handled) resolve({ ok: true });
        }),
    },
    storage: {
      local: {
        get: async () => ({ ...data }),
        set: async (values: Record<string, unknown>) => {
          const updated: Record<string, chrome.storage.StorageChange> = {};
          for (const [key, value] of Object.entries(values)) {
            updated[key] = { oldValue: data[key], newValue: value };
            data[key] = value;
          }
          changes.forEach((listener) => listener(updated, 'local'));
        },
      },
      onChanged: {
        addListener: (fn: Parameters<typeof chrome.storage.onChanged.addListener>[0]) =>
          changes.add(fn),
        removeListener: (fn: Parameters<typeof chrome.storage.onChanged.addListener>[0]) =>
          changes.delete(fn),
      },
    },
  });
  document.body.innerHTML = `<style>input[type=radio]{display:none}</style><div role="dialog"><p>Apply to Playlist</p><form><p>Additional Questions</p><div id="questions"></div></form></div><div id="eze-custom-root"></div>`;
  const questions = document.getElementById('questions')!;
  const renderStep = () => {
    questions.innerHTML = capturedRadio + capturedRadio.replaceAll('_r_5', '_r_7');
    questions.querySelector<HTMLInputElement>('#_r_7j_')!.checked = true;
  };
  const checked = (id: string) => (document.getElementById(id) as HTMLInputElement).checked;
  installAppBackground();
  const unmount = await mountPanel(document.getElementById('eze-custom-root')!);
  let stop: (() => void) | undefined;
  try {
    renderStep();
    stop = startContent();
    await vi.advanceTimersByTimeAsync(600);
    expect(checked('_r_5h_')).toBe(false);
    const toggle = document.querySelector<HTMLInputElement>(
      '[aria-label="Default Yes for Yes/No questions"]',
    )!;
    toggle.click();
    await vi.advanceTimersByTimeAsync(600);
    expect(data[DEFAULT_YES_KEY]).toBe(true);
    expect(toggle.checked).toBe(true);
    expect(checked('_r_5h_')).toBe(true);
    expect(checked('_r_7j_')).toBe(true);

    // The persisted preference survives a content-script restart and new step.
    stop();
    renderStep();
    stop = startContent();
    await vi.advanceTimersByTimeAsync(600);
    expect(checked('_r_5h_')).toBe(true);
    expect(checked('_r_7j_')).toBe(true);

    // Re-rendering a new step in the same SPA triggers the observer, too.
    renderStep();
    await vi.advanceTimersByTimeAsync(600);
    expect(checked('_r_5h_')).toBe(true);
    expect(checked('_r_7j_')).toBe(true);

    toggle.click();
    await vi.advanceTimersByTimeAsync(10);
    renderStep();
    await vi.advanceTimersByTimeAsync(600);
    expect(data[DEFAULT_YES_KEY]).toBe(false);
    expect(checked('_r_5h_')).toBe(false);
    expect(checked('_r_7j_')).toBe(true);
    expect(data[STORAGE_KEY]).toEqual({
      version: 1,
      profiles: { local: { fields: [], autoFill: false } },
    });
  } finally {
    stop?.();
    unmount();
  }
});
