import { installCVTransfer, mountCVFileDrop } from '../src/cv-transfer';
if (location.pathname === '/cv-tray.html') {
  let listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0];
  Object.assign(window, {
    chrome: {
      runtime: {
        id: 'cv-test',
        getURL: (path: string) => `chrome-extension://cv-test/${path}`,
        onMessage: {
          addListener: (fn: typeof listener) => {
            listener = fn;
          },
        },
      },
      tabs: { query: async () => [{ id: 1, url: 'http://localhost:4317/cv-drop.html' }] },
    },
  });
  installCVTransfer();
  window.addEventListener('message', (event) => {
    if (
      !['http://localhost:4317', 'http://127.0.0.1:4317'].includes(event.origin) ||
      event.data?.channel !== 'cv-test'
    )
      return;
    const frames = [...document.querySelectorAll('iframe')];
    const source = frames.find((frame) => frame.contentWindow === event.source);
    if (!source) return;
    const sender =
      source.title === 'EZEapply side pane'
        ? { id: 'cv-test', url: 'chrome-extension://cv-test/sidepanel.html' }
        : { id: 'cv-test', url: 'http://localhost:4317/cv-drop.html', tab: { id: 1 } };
    listener(event.data.message, sender as chrome.runtime.MessageSender, (result) =>
      source.contentWindow?.postMessage(
        { channel: 'cv-response', id: event.data.id, result },
        event.origin,
      ),
    );
  });
} else {
  const existing = window.chrome?.runtime?.sendMessage?.bind(window.chrome.runtime);
  const runtime = window.chrome?.runtime || {
    id: 'cv-test',
    onMessage: { addListener: () => {}, removeListener: () => {} },
  };
  Object.assign(runtime, {
    sendMessage: (message: { type: string }) => {
      if (!message.type.startsWith('eze-cv:')) return existing?.(message) || Promise.resolve({});
      return new Promise((resolve) => {
        const id = crypto.randomUUID();
        const handler = (event: MessageEvent) => {
          if (
            event.source !== parent ||
            event.origin !== 'http://127.0.0.1:4317' ||
            event.data?.channel !== 'cv-response' ||
            event.data.id !== id
          )
            return;
          window.removeEventListener('message', handler);
          resolve(event.data.result);
        };
        window.addEventListener('message', handler);
        parent.postMessage({ channel: 'cv-test', id, message }, 'http://127.0.0.1:4317');
      });
    },
  });
  if (!window.chrome?.runtime) Object.assign(window, { chrome: { runtime } });
  if (location.pathname === '/cv-drop.html') mountCVFileDrop();
}
