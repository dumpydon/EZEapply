// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPanelDock } from '../src/panel-dock';
import { PANEL_RESTORE_KEY } from '../src/types';
let cleanup: (() => void) | undefined;
type Listener = (...args: any[]) => unknown;
function setup(enabled?: unknown, hidden = true) {
  const messages: Listener[] = [],
    changes: Listener[] = [];
  const send = vi.fn().mockResolvedValue({ hidden });
  const get = vi.fn().mockResolvedValue({ [PANEL_RESTORE_KEY]: enabled });
  const removeMessage = vi.fn(),
    removeChange = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: send,
      onMessage: {
        addListener: (fn: Listener) => messages.push(fn),
        removeListener: removeMessage,
      },
    },
    storage: {
      local: { get },
      onChanged: { addListener: (fn: Listener) => changes.push(fn), removeListener: removeChange },
    },
  });
  return {
    send,
    get,
    removeMessage,
    removeChange,
    hidden(value: boolean) {
      messages.forEach((fn) =>
        fn({ type: 'eze-custom:panel-hidden', hidden: value }, {}, () => {}),
      );
    },
    preference(value: unknown) {
      changes.forEach((fn) => fn({ [PANEL_RESTORE_KEY]: { newValue: value } }, 'local'));
    },
  };
}
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
describe('panel restore dock', () => {
  it('keeps the floating button off by default, including after another hide event', async () => {
    const api = setup();
    cleanup = mountPanelDock();
    await settle();
    api.hidden(true);
    expect(document.querySelector('#ezeapply-panel-restore')).toBeNull();
  });
  it('shows one isolated restore control only when opted in and the native panel is hidden', async () => {
    const api = setup(true);
    cleanup = mountPanelDock();
    await settle();
    expect(document.querySelectorAll('#ezeapply-panel-restore')).toHaveLength(1);
    api.hidden(true);
    expect(document.querySelectorAll('#ezeapply-panel-restore')).toHaveLength(1);
    // Closed shadow root keeps site CSS, labels and autofill discovery out.
    expect(document.querySelector('#ezeapply-panel-restore')!.shadowRoot).toBeNull();
    api.hidden(false);
    expect(document.querySelector('#ezeapply-panel-restore')).toBeNull();
  });
  it('applies preference changes immediately to an already hidden panel', async () => {
    const api = setup(true);
    cleanup = mountPanelDock();
    await settle();
    api.preference(false);
    expect(document.querySelector('#ezeapply-panel-restore')).toBeNull();
    api.hidden(true);
    expect(document.querySelector('#ezeapply-panel-restore')).toBeNull();
    api.preference(true);
    expect(document.querySelectorAll('#ezeapply-panel-restore')).toHaveLength(1);
    api.preference('true');
    expect(document.querySelector('#ezeapply-panel-restore')).toBeNull();
  });
  it('does not show the control while the panel is open', async () => {
    setup(true, false);
    cleanup = mountPanelDock();
    await settle();
    expect(document.querySelector('#ezeapply-panel-restore')).toBeNull();
  });
  it('does not let a delayed preference read undo a newer disable event', async () => {
    const api = setup(true);
    let finish!: (value: Record<string, unknown>) => void;
    api.get.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    cleanup = mountPanelDock();
    await settle();
    api.preference(false);
    finish({ [PANEL_RESTORE_KEY]: true });
    await settle();
    expect(document.querySelector('#ezeapply-panel-restore')).toBeNull();
  });
  it('does not let delayed initial state resurrect the button after the panel opens', async () => {
    const api = setup(true);
    let finish!: (value: { hidden: boolean }) => void;
    api.send.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    cleanup = mountPanelDock();
    await settle();
    api.hidden(false);
    finish({ hidden: true });
    await settle();
    expect(document.querySelector('#ezeapply-panel-restore')).toBeNull();
  });
  it('removes listeners and ignores pending startup reads after cleanup', async () => {
    const api = setup(true);
    cleanup = mountPanelDock();
    cleanup();
    await settle();
    expect(document.querySelector('#ezeapply-panel-restore')).toBeNull();
    expect(api.removeMessage).toHaveBeenCalledOnce();
    expect(api.removeChange).toHaveBeenCalledOnce();
    cleanup = undefined;
  });
});
