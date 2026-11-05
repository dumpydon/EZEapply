import { APPEARANCE_KEY, COLOR_THEMES, colorTheme, type ColorThemeId } from './appearance-config';

const APPEARANCE_EVENT = 'eze-appearance-changed';

export function applyAppearance(document: Document, value: unknown): void {
  const theme = colorTheme(value),
    root = document.documentElement;
  for (const [name, color] of Object.entries(theme.colors))
    root.style.setProperty(`--ui-${name}`, color);
  root.dataset.ezeTheme = theme.id;
  document.dispatchEvent(new Event(APPEARANCE_EVENT));
}

/** Subscribe before reading so a slow startup read cannot undo a newer choice. */
export function watchAppearance(document: Document): () => void {
  let disposed = false,
    revision = 0;
  applyAppearance(document, undefined);
  const changed: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area !== 'local' || !changes[APPEARANCE_KEY] || disposed) return;
    revision++;
    applyAppearance(document, changes[APPEARANCE_KEY].newValue);
  };
  chrome.storage.onChanged.addListener(changed);
  const edited = () => {
    revision++;
  };
  document.addEventListener(APPEARANCE_EVENT, edited);
  const initial = revision;
  void chrome.storage.local
    .get(APPEARANCE_KEY)
    .then((values) => {
      if (!disposed && initial === revision) applyAppearance(document, values[APPEARANCE_KEY]);
    })
    .catch(() => {
      /* The dark default remains available if local storage cannot be read. */
    });
  return () => {
    disposed = true;
    chrome.storage.onChanged.removeListener(changed);
    document.removeEventListener(APPEARANCE_EVENT, edited);
  };
}

export function mountThemePicker(document: Document = window.document): {
  button: HTMLButtonElement;
  dispose(): void;
} {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'eze-appearance-trigger';
  trigger.setAttribute('aria-label', 'Choose color theme');
  trigger.setAttribute('aria-haspopup', 'dialog');
  const ns = 'http://www.w3.org/2000/svg',
    icon = document.createElementNS(ns, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const outline = document.createElementNS(ns, 'path');
  outline.setAttribute(
    'd',
    'M12 3a9 9 0 1 0 0 18h1.4a2.5 2.5 0 0 0 1.6-4.4c-.7-.6-.3-1.6.6-1.6H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z',
  );
  icon.append(outline);
  for (const [cx, cy] of [
    [7, 10],
    [10, 6.8],
    [14.3, 7],
    [17, 10.2],
  ]) {
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', String(cx));
    dot.setAttribute('cy', String(cy));
    dot.setAttribute('r', '1');
    icon.append(dot);
  }
  trigger.append(icon);
  const dialog = document.createElement('dialog');
  dialog.className = 'eze-appearance-dialog';
  dialog.setAttribute('aria-label', 'Color theme');
  const heading = document.createElement('div');
  heading.className = 'eze-appearance-heading';
  const title = document.createElement('h2');
  title.textContent = 'Color theme';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'eze-appearance-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close color themes');
  heading.append(title, close);
  const hint = document.createElement('p');
  hint.className = 'eze-appearance-hint';
  hint.textContent = 'Muted colors. A quieter workspace.';
  const choices = document.createElement('fieldset');
  choices.className = 'eze-theme-choices';
  const legend = document.createElement('legend');
  legend.textContent = 'Choose an appearance';
  choices.append(legend);
  for (const theme of COLOR_THEMES) {
    const label = document.createElement('label');
    label.className = 'eze-theme-choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'eze-color-theme';
    input.value = theme.id;
    const preview = document.createElement('span');
    preview.className = 'eze-theme-preview';
    preview.setAttribute('aria-hidden', 'true');
    preview.style.setProperty('--swatch-bg', theme.colors.bg);
    preview.style.setProperty('--swatch-panel', theme.colors.panel);
    preview.style.setProperty('--swatch-accent', theme.colors.accent);
    const caption = document.createElement('span');
    caption.textContent = theme.label;
    label.append(input, preview, caption);
    choices.append(label);
    input.addEventListener('change', () => {
      if (input.checked) void save(theme.id);
    });
  }
  const status = document.createElement('p');
  status.className = 'eze-appearance-status';
  status.setAttribute('role', 'status');
  status.textContent = 'Saved on this device · applies to all panels';
  dialog.append(heading, hint, choices, status);
  let disposed = false;
  function sync() {
    if (disposed) return;
    const selected = colorTheme(document.documentElement.dataset.ezeTheme);
    trigger.title = `Color theme · ${selected.label}`;
    for (const input of choices.querySelectorAll('input'))
      input.checked = input.value === selected.id;
  }
  async function save(id: ColorThemeId) {
    const previous = document.documentElement.dataset.ezeTheme;
    const focused = document.activeElement;
    applyAppearance(document, id);
    choices.disabled = true;
    status.textContent = 'Saving theme…';
    status.classList.remove('is-error');
    try {
      const result = await chrome.runtime.sendMessage({ type: 'eze-app:appearance', theme: id });
      if (!result?.ok) throw new Error(result?.error || 'Could not save this theme. Try again.');
      if (!disposed) status.textContent = 'Saved on this device · applies to all panels';
    } catch (error) {
      if (disposed) return;
      if (document.documentElement.dataset.ezeTheme === id) applyAppearance(document, previous);
      status.textContent =
        error instanceof Error ? error.message : 'Could not save this theme. Try again.';
      status.classList.add('is-error');
    } finally {
      if (!disposed) {
        choices.disabled = false;
        // Disabling native radios temporarily moves focus to the document.
        // Restore it so arrow-key selection continues, without stealing focus
        // from Close or another control the user moved to while saving.
        if (dialog.open && document.activeElement === document.body && choices.contains(focused))
          (focused as HTMLInputElement).focus();
      }
    }
  }
  trigger.addEventListener('click', () => {
    if (!dialog.isConnected) document.body.append(dialog);
    sync();
    if (!dialog.open) dialog.showModal();
    choices.querySelector<HTMLInputElement>('input:checked')?.focus();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      dialog.close();
  });
  dialog.addEventListener('close', () => trigger.focus());
  document.addEventListener(APPEARANCE_EVENT, sync);
  sync();
  return {
    button: trigger,
    dispose() {
      disposed = true;
      document.removeEventListener(APPEARANCE_EVENT, sync);
      dialog.remove();
      trigger.remove();
    },
  };
}
