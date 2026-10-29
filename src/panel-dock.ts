import { PANEL_RESTORE_KEY } from './types';

/** The webpage restore button is isolated from employer styles and form fields. */
export function mountPanelDock(): () => void {
  if (window.top !== window) return () => {};
  let host: HTMLDivElement | undefined;
  let stopped = false;
  let panelHidden = false;
  let enabled = false;
  let stateVersion = 0;
  let preferenceVersion = 0;
  function hide(): void {
    host?.remove();
    host = undefined;
  }
  function show(): void {
    if (host?.isConnected) return;
    host = document.createElement('div');
    host.id = 'ezeapply-panel-restore';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent =
      ':host{all:initial;position:fixed;z-index:2147483000;right:10px;bottom:24px;display:block}button{font:600 12px/1.2 -apple-system,BlinkMacSystemFont,sans-serif;color:white;background:linear-gradient(120deg,#167f70,#3b9f8b);border:1px solid #a4c5dc;border-radius:20px;padding:10px 13px;box-shadow:0 3px 16px #0004;cursor:pointer}button:focus-visible{outline:3px solid #89bdd4;outline-offset:3px}';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '‹ EZEapply';
    button.title = 'Show EZEapply side panel';
    button.setAttribute('aria-label', 'Show EZEapply side panel');
    button.addEventListener('click', () => {
      button.disabled = true;
      chrome.runtime
        .sendMessage({ type: 'eze-custom:show-panel' })
        .then((result) => {
          if (result?.ok) hide();
          else {
            button.disabled = false;
            button.title = result?.error || 'Open EZEapply from the Chrome toolbar';
          }
        })
        .catch(() => {
          button.disabled = false;
          button.title = 'Open EZEapply from the Chrome toolbar';
        });
    });
    shadow.append(style, button);
    document.documentElement.append(host);
  }
  function render(): void {
    if (!stopped && panelHidden && enabled) show();
    else hide();
  }
  const receive: Parameters<typeof chrome.runtime.onMessage.addListener>[0] = (
    message,
    _sender,
    respond,
  ) => {
    if (message?.type !== 'eze-custom:panel-hidden') return;
    stateVersion++;
    panelHidden = message.hidden === true;
    render();
    respond({ ok: true });
  };
  const preferenceChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
    changes,
    area,
  ) => {
    if (area !== 'local' || !changes[PANEL_RESTORE_KEY]) return;
    preferenceVersion++;
    enabled = changes[PANEL_RESTORE_KEY].newValue === true;
    render();
  };
  chrome.runtime.onMessage.addListener(receive);
  chrome.storage.onChanged.addListener(preferenceChanged);
  const initialState = stateVersion;
  chrome.runtime
    .sendMessage({ type: 'eze-custom:panel-state' })
    .then((result) => {
      if (stopped || stateVersion !== initialState) return;
      panelHidden = result?.hidden === true;
      render();
    })
    .catch(() => {});
  const initialPreference = preferenceVersion;
  chrome.storage.local
    .get(PANEL_RESTORE_KEY)
    .then((data) => {
      if (stopped || preferenceVersion !== initialPreference) return;
      enabled = data[PANEL_RESTORE_KEY] === true;
      render();
    })
    .catch(() => {});
  return () => {
    stopped = true;
    hide();
    chrome.runtime.onMessage.removeListener(receive);
    chrome.storage.onChanged.removeListener(preferenceChanged);
  };
}
