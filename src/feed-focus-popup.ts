import {
  FEED_FOCUS_KEY,
  FEED_QUOTE_LIMIT,
  FEED_QUOTES,
  readFeedFocusSettings,
} from './feed-focus-settings';
import { navigationIcon } from './navigation-icon';

export function mountFeedFocus(): { button: HTMLButtonElement; dispose(): void } {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'popup-shortcut';
  button.title = 'Feed Focus';
  button.setAttribute('aria-label', 'Feed Focus');
  button.setAttribute('aria-haspopup', 'dialog');
  button.append(navigationIcon('feed-focus'));

  let dialog: HTMLDialogElement | undefined;
  let disposed = false;
  let revision = 0;
  let settings = readFeedFocusSettings(undefined);
  function paint(raw: unknown) {
    settings = readFeedFocusSettings(raw);
    button.title = settings.enabled ? 'Feed Focus (on)' : 'Feed Focus';
    button.dataset.enabled = String(settings.enabled);
  }
  async function refresh() {
    const before = revision;
    const data = await chrome.storage.local.get(FEED_FOCUS_KEY);
    if (!disposed && before === revision) paint(data[FEED_FOCUS_KEY]);
  }
  const onStorage: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (disposed || area !== 'local' || !changes[FEED_FOCUS_KEY]) return;
    revision++;
    paint(changes[FEED_FOCUS_KEY].newValue);
  };
  chrome.storage.onChanged.addListener(onStorage);
  void refresh().catch(() => {});

  button.addEventListener('click', () => {
    if (disposed || dialog) return;
    const editor = document.createElement('dialog');
    dialog = editor;
    editor.className = 'feed-focus-dialog';
    editor.setAttribute('aria-labelledby', 'feed-focus-title');
    const form = document.createElement('form');
    form.innerHTML = `
      <header class="feed-focus-heading">
        <div>
          <h2 id="feed-focus-title" tabindex="-1">Feed Focus</h2>
          <p>LinkedIn Home feed</p>
        </div>
      </header>
      <label class="eze-popup-option feed-focus-toggle">
        <span>Block Home feed</span>
        <input type="checkbox" role="switch" disabled>
      </label>
      <label class="feed-focus-field" for="feed-focus-quote">Focus quote</label>
      <select id="feed-focus-quote" disabled></select>
      <div class="feed-focus-custom" hidden>
        <label class="feed-focus-field" for="feed-focus-custom">Custom quote</label>
        <textarea id="feed-focus-custom" rows="3" maxlength="${FEED_QUOTE_LIMIT}" disabled></textarea>
      </div>
      <p class="feed-focus-error" role="alert" hidden></p>
      <footer class="feed-focus-actions">
        <button type="button">Cancel</button>
        <button type="submit" disabled>Save</button>
      </footer>`;
    form.querySelector('header')!.prepend(navigationIcon('feed-focus'));
    const heading = form.querySelector('h2')!;
    const toggle = form.querySelector('input')!;
    const choice = form.querySelector('select')!;
    const custom = form.querySelector('textarea')!;
    const customField = form.querySelector<HTMLElement>('.feed-focus-custom')!;
    const error = form.querySelector<HTMLElement>('[role="alert"]')!;
    const cancel = form.querySelector<HTMLButtonElement>('button[type="button"]')!;
    const save = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    for (const [id, quote] of Object.entries(FEED_QUOTES)) choice.add(new Option(quote, id));
    choice.add(new Option('Custom quote…', 'custom'));

    function showError(message: string) {
      error.textContent = message;
      error.hidden = !message;
    }
    function setDisabled(disabled: boolean) {
      toggle.disabled = choice.disabled = custom.disabled = save.disabled = disabled;
    }
    function showCustom() {
      customField.hidden = choice.value !== 'custom';
    }
    function close() {
      editor.close?.();
      editor.remove();
      dialog = undefined;
      button.focus();
    }
    cancel.addEventListener('click', close);
    editor.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (!cancel.disabled) close();
    });
    choice.addEventListener('change', showCustom);
    form.addEventListener('input', () => {
      custom.removeAttribute('aria-invalid');
      showError('');
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (save.disabled) return;
      if (choice.value === 'custom' && !custom.value.trim()) {
        showError('Enter a custom quote or choose a preset.');
        custom.setAttribute('aria-invalid', 'true');
        custom.focus();
        return;
      }
      const next = readFeedFocusSettings({
        enabled: toggle.checked,
        quote: choice.value,
        customQuote: custom.value,
      });
      setDisabled(true);
      cancel.disabled = true;
      const before = revision;
      try {
        await chrome.storage.local.set({ [FEED_FOCUS_KEY]: next });
        if (!disposed && before === revision) paint(next);
        if (editor.isConnected) close();
      } catch {
        if (!editor.isConnected) return;
        setDisabled(false);
        cancel.disabled = false;
        showError('Could not save Feed Focus settings. Try again.');
      }
    });

    editor.append(form);
    document.body.append(editor);
    if (typeof editor.showModal === 'function') editor.showModal();
    else editor.setAttribute('open', '');
    heading.focus();
    void refresh()
      .then(() => {
        if (!editor.isConnected) return;
        toggle.checked = settings.enabled;
        choice.value = settings.quote;
        custom.value = settings.customQuote;
        showCustom();
        setDisabled(false);
      })
      .catch(() => {
        if (editor.isConnected)
          showError('Could not load Feed Focus settings. Close and try again.');
      });
  });

  return {
    button,
    dispose() {
      disposed = true;
      dialog?.remove();
      chrome.storage.onChanged.removeListener(onStorage);
    },
  };
}
