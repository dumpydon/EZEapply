import { navigationIcon } from './navigation-icon';

/** Compact entry points; detailed analytics stay on their own extension page. */
export function mountActivityControls(): { decorate(): void; dispose(): void } {
  let disposed = false,
    editor: HTMLDialogElement | undefined;
  const href = chrome.runtime.getURL('analytics.html');
  const shortcut = document.createElement('a');
  shortcut.href = href;
  shortcut.target = '_blank';
  shortcut.rel = 'noopener';
  shortcut.title = 'Analytics';
  shortcut.setAttribute('aria-label', 'Open application analytics');
  shortcut.append(navigationIcon('analytics'));
  const nav = document.createElement('a');
  nav.href = href;
  nav.textContent = 'Analytics';
  nav.dataset.ezeAnalytics = 'true';
  const goal = document.createElement('button');
  goal.type = 'button';
  goal.className = 'eze-count-step eze-goal-edit';
  goal.title = 'Edit daily goal';
  goal.setAttribute('aria-label', 'Edit daily goal');
  const ns = 'http://www.w3.org/2000/svg',
    pencil = document.createElementNS(ns, 'svg'),
    path = document.createElementNS(ns, 'path');
  pencil.setAttribute('viewBox', '0 0 24 24');
  pencil.setAttribute('fill', 'none');
  pencil.setAttribute('stroke', 'currentColor');
  pencil.setAttribute('stroke-width', '1.8');
  pencil.setAttribute('aria-hidden', 'true');
  path.setAttribute('d', 'm15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z');
  pencil.append(path);
  goal.append(pencil);
  function openGoal() {
    if (editor) return;
    const dialog = document.createElement('dialog');
    editor = dialog;
    dialog.className = 'eze-goal-dialog';
    dialog.setAttribute('aria-labelledby', 'eze-goal-title');
    const form = document.createElement('form'),
      title = document.createElement('h2'),
      help = document.createElement('p');
    title.id = 'eze-goal-title';
    title.textContent = 'Your daily goal';
    help.textContent = 'Set your target. Applications already counted stay counted.';
    const label = document.createElement('label');
    label.textContent = 'Applications per day';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '10000';
    input.step = '1';
    input.required = true;
    input.value = '10';
    label.append(input);
    const error = document.createElement('p');
    error.className = 'eze-goal-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'eze-goal-actions';
    const cancel = document.createElement('button'),
      save = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    save.type = 'submit';
    save.textContent = 'Save goal';
    save.className = 'eze-goal-save';
    actions.append(cancel, save);
    form.append(title, help, label, error, actions);
    dialog.append(form);
    document.body.append(dialog);
    let dirty = false;
    input.addEventListener('input', () => {
      dirty = true;
    });
    chrome.storage.local
      .get('dailyGoal')
      .then((data) => {
        if (
          dialog.isConnected &&
          !dirty &&
          typeof data.dailyGoal === 'number' &&
          Number.isInteger(data.dailyGoal) &&
          data.dailyGoal > 0
        )
          input.value = String(data.dailyGoal);
      })
      .catch(() => {});
    function close() {
      dialog.close?.();
      dialog.remove();
      editor = undefined;
      goal.focus();
    }
    cancel.addEventListener('click', close);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = Number(input.value);
      error.hidden = true;
      if (!Number.isInteger(value) || value < 1 || value > 10000) {
        error.textContent = 'Choose a whole number from 1 to 10,000.';
        error.hidden = false;
        return;
      }
      save.disabled = true;
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'eze-tracking:set-goal',
          goal: value,
        });
        if (!result?.ok) throw new Error(result?.error || 'Could not save your goal. Try again.');
        if (dialog.isConnected) close();
      } catch (reason) {
        if (dialog.isConnected) {
          error.textContent =
            reason instanceof Error ? reason.message : 'Could not save your goal.';
          error.hidden = false;
          save.disabled = false;
        }
      }
    });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    input.focus();
    input.select();
  }
  goal.addEventListener('click', openGoal);
  function decorate() {
    if (disposed) return;
    const count = document.querySelector('.eze-count-controls');
    if (count && goal.parentElement !== count) count.append(goal);
    const applications = [...document.querySelectorAll<HTMLButtonElement>('#root button')].find(
      (button) => button.title === 'View Applications',
    );
    const shortcuts = applications?.parentElement;
    if (shortcuts && shortcut.parentElement !== shortcuts) {
      shortcut.className = `${applications.className} eze-analytics-shortcut`;
      shortcuts.append(shortcut);
    }
    const nativeNav = document.querySelector('#root .eze-native-nav-links');
    if (nativeNav && nav.parentElement !== nativeNav) nativeNav.append(nav);
  }
  decorate();
  return {
    decorate,
    dispose() {
      disposed = true;
      editor?.remove();
      goal.remove();
      shortcut.remove();
      nav.remove();
    },
  };
}
