// Synthetic transport only. Production themes use chrome.storage.local and the
// trusted extension-view RPC; this shim synchronizes the localhost preview frames.
(() => {
  const key = 'eze.colorTheme.v1',
    preview = 'eze-preview-color-theme';
  const api = window.chrome,
    listeners = new Set();
  const oldGet = api.storage.local.get.bind(api.storage.local);
  api.storage.local.get = (keys, callback) => {
    if (keys !== key) return oldGet(keys, callback);
    const value = { [key]: localStorage.getItem(preview) || undefined };
    callback?.(value);
    return Promise.resolve(value);
  };
  const oldEvent = api.storage.onChanged;
  api.storage.onChanged = {
    addListener(fn) {
      listeners.add(fn);
      oldEvent?.addListener(fn);
    },
    removeListener(fn) {
      listeners.delete(fn);
      oldEvent?.removeListener(fn);
    },
  };
  const changed = (oldValue, newValue) =>
    listeners.forEach((fn) => fn({ [key]: { oldValue, newValue } }, 'local'));
  window.addEventListener('storage', (event) => {
    if (event.key === preview) changed(event.oldValue, event.newValue);
  });
  const send = api.runtime.sendMessage.bind(api.runtime);
  api.runtime.sendMessage = async (message) => {
    if (message.type !== 'eze-app:appearance') return send(message);
    const previous = localStorage.getItem(preview);
    localStorage.setItem(preview, message.theme);
    changed(previous, message.theme);
    return { ok: true };
  };
})();
