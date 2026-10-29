import { getAutoFillPreference, setAutoFillPreference } from './storage';
import { LINKEDIN_NOFOLLOW_KEY, PANEL_RESTORE_KEY, STORAGE_KEY } from './types';

function savedAnswersSwitch() {
  let disposed = false,
    ready = false,
    saving = false,
    revision = 0;
  let preference = { profileId: '', enabled: false };
  const row = document.createElement('label');
  row.className = 'eze-popup-option eze-popup-auto-fill';
  row.title =
    'Fill empty job application fields from your saved answers when pages and new form steps load. Synced with Auto fill in the side panel. Your edits are kept.';
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', 'Auto-fill saved answers');
  const text = document.createElement('span');
  text.textContent = 'Auto-fill saved answers';
  row.append(toggle, text);
  const status = document.createElement('div');
  status.className = 'eze-popup-preference-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  function render() {
    toggle.checked = preference.enabled;
    toggle.disabled = !ready || saving;
  }
  async function refresh() {
    const request = ++revision;
    ready = false;
    render();
    try {
      const current = await getAutoFillPreference();
      if (disposed || request !== revision) return;
      preference = current;
      ready = true;
      status.hidden = true;
    } catch {
      if (!disposed && request === revision) {
        status.textContent = 'Could not load automatic filling. Reopen this popup to retry.';
        status.hidden = false;
      }
    } finally {
      if (!disposed && request === revision) render();
    }
  }
  const changed: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (
      !disposed &&
      area === 'local' &&
      (changes[STORAGE_KEY] || changes.profile || changes.lastSyncProfile)
    )
      void refresh();
  };
  toggle.addEventListener('change', async () => {
    const desired = toggle.checked,
      profileId = preference.profileId;
    saving = true;
    status.hidden = true;
    render();
    try {
      await setAutoFillPreference(desired, profileId);
      if (!disposed) await refresh();
    } catch (error) {
      if (!disposed) {
        status.textContent =
          error instanceof Error ? error.message : 'Could not save automatic filling. Try again.';
        status.hidden = false;
      }
    } finally {
      saving = false;
      if (!disposed) render();
    }
  });
  chrome.storage.onChanged.addListener(changed);
  void refresh();
  return {
    row,
    status,
    dispose() {
      disposed = true;
      chrome.storage.onChanged.removeListener(changed);
      row.remove();
      status.remove();
    },
  };
}

function savedSwitch(
  key: string,
  label: string,
  accessibleLabel: string,
  title: string,
  cls: string,
  settingName: string,
) {
  let disposed = false;
  let enabled = false;
  let ready = false;
  let saving = false;
  let revision = 0;
  const row = document.createElement('label');
  row.className = `eze-popup-option ${cls}`;
  row.title = title;
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', accessibleLabel);
  const text = document.createElement('span');
  text.textContent = label;
  row.append(toggle, text);
  const status = document.createElement('div');
  status.className = 'eze-popup-preference-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  function render(): void {
    toggle.checked = enabled;
    toggle.disabled = !ready || saving;
  }
  function error(message: string): void {
    status.textContent = message;
    status.hidden = false;
  }
  const changed: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (disposed || area !== 'local' || !changes[key]) return;
    revision++;
    enabled = changes[key].newValue === true;
    render();
  };
  toggle.addEventListener('change', async () => {
    const desired = toggle.checked;
    const writeRevision = ++revision;
    saving = true;
    status.hidden = true;
    render();
    try {
      await chrome.storage.local.set({ [key]: desired });
      if (revision === writeRevision) enabled = desired;
    } catch {
      if (!disposed) error(`Could not save the ${settingName} setting. Try again.`);
    } finally {
      saving = false;
      if (!disposed) render();
    }
  });
  chrome.storage.onChanged.addListener(changed);
  const initialRevision = revision;
  chrome.storage.local
    .get(key)
    .then((data) => {
      if (!disposed && revision === initialRevision) enabled = data[key] === true;
      ready = true;
    })
    .catch(() => {
      if (!disposed)
        error(`Could not load the ${settingName} setting. Reopen this popup to retry.`);
    })
    .finally(() => {
      if (!disposed) render();
    });
  render();
  return {
    row,
    status,
    dispose() {
      disposed = true;
      chrome.storage.onChanged.removeListener(changed);
      row.remove();
      status.remove();
    },
  };
}

/** Keep saved local preferences together in the toolbar popup's Quick Access. */
export function mountPopupControls(): { decorate(): void; dispose(): void } {
  let disposed = false;
  const controls = [
    savedAnswersSwitch(),
    savedSwitch(
      PANEL_RESTORE_KEY,
      'Closed panel floating button',
      'Show closed panel floating button',
      'Show a small EZEapply button on webpages when the side panel is closed.',
      'eze-popup-floating',
      'floating button',
    ),
    savedSwitch(
      LINKEDIN_NOFOLLOW_KEY,
      'Turn off LinkedIn auto-follow',
      'Turn off LinkedIn auto-follow',
      'Automatically untick company-follow boxes in LinkedIn application dialogs. Existing follows and other checkboxes are unchanged.',
      'eze-popup-linkedin-follow',
      'LinkedIn auto-follow',
    ),
  ];
  function decorate() {
    if (disposed) return;
    let previous: Element | undefined = [...document.querySelectorAll('#root label')].find(
      (label) => /^Autofill (?:Enabled|Disabled)$/.test(label.textContent?.trim() || ''),
    );
    if (!previous) return;
    for (const control of controls) {
      if (previous.nextElementSibling !== control.row) previous.after(control.row, control.status);
      previous = control.status;
    }
  }
  decorate();
  return {
    decorate,
    dispose() {
      disposed = true;
      controls.forEach((control) => control.dispose());
    },
  };
}
