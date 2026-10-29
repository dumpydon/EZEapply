import {
  getActiveFields,
  getCustomProfile,
  getProfileContext,
  parseImport,
  saveCustomProfile,
  setAutoFillPreference,
} from './storage';
import type { CustomField, FillReport, ProfileFields, Question } from './types';
import { STORAGE_KEY } from './types';
import { moveField, orderFields } from './order';
import { createFieldDragController } from './drag';
import { mountZoom } from './zoom';

const TEMPLATES: Record<string, Partial<CustomField>> = {
  'Expected compensation': {
    label: 'Expected compensation',
    aliases: [
      'expected salary',
      'salary expectations',
      'desired salary',
      'expected CTC',
      'desired compensation',
    ],
    exclude: ['current', 'previous', 'last drawn'],
    category: 'Compensation',
  },
  'Current compensation': {
    label: 'Current compensation',
    aliases: ['current salary', 'current CTC', 'present compensation', 'last drawn salary'],
    exclude: ['expected', 'desired'],
    category: 'Compensation',
  },
  'Expected CTC — no units in question': {
    label: 'Expected CTC',
    aliases: ['desired CTC'],
    exclude: ['current', 'previous', 'last drawn'],
    category: 'Compensation',
  },
  'Expected CTC — INR / rupees': {
    label: 'Expected CTC in INR',
    aliases: ['expected CTC in rupees', 'desired CTC in INR'],
    exclude: ['current', 'previous', 'last drawn'],
    category: 'Compensation',
  },
  'Expected CTC — lakhs / LPA': {
    label: 'Expected CTC in lakhs',
    aliases: ['expected CTC in LPA'],
    exclude: ['current', 'previous', 'last drawn'],
    category: 'Compensation',
  },
  'Current CTC — INR / rupees': {
    label: 'Current CTC in INR',
    aliases: ['current CTC in rupees'],
    exclude: ['expected', 'desired'],
    category: 'Compensation',
  },
  'Current CTC — lakhs / LPA': {
    label: 'Current CTC in lakhs',
    aliases: ['current CTC in LPA'],
    exclude: ['expected', 'desired'],
    category: 'Compensation',
  },
  'Notice period': {
    label: 'Notice period',
    aliases: ['notice period', 'when can you start', 'availability to start'],
    category: 'Personal questions',
  },
  'Total experience — years': {
    label: 'Total years of professional experience',
    aliases: [],
    category: 'Experience',
  },
  'Relevant experience — years': {
    label: 'Relevant experience in years',
    aliases: [],
    category: 'Experience',
  },
  'Personal answer': { label: '', aliases: [], category: 'Personal questions' },
  'Another phone format': {
    label: 'Phone number',
    aliases: [],
    category: 'Contact',
    enabled: false,
  },
};

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, className = '', label?: string): HTMLButtonElement {
  const node = element('button', className, text);
  node.type = 'button';
  if (label) {
    node.setAttribute('aria-label', label);
    node.title = label;
  }
  return node;
}

function lines(value: string): string[] {
  return [
    ...new Set(
      value
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export async function copyValue(value: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(value);
  } catch {
    const previous = document.activeElement;
    const textarea = element('textarea');
    textarea.value = value;
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(textarea);
    textarea.select();
    try {
      if (typeof document.execCommand !== 'function' || !document.execCommand('copy'))
        throw new Error('Clipboard access was denied. Try again while this panel is focused.');
    } finally {
      textarea.remove();
      if (previous instanceof HTMLElement) previous.focus();
    }
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function mountPanel(host: HTMLElement): Promise<() => void> {
  host.classList.add('eze-panel');
  let disposed = false;
  let generation = 0;
  let activeFields: ProfileFields = { fields: [], autoFill: false };
  let currentProfileId = '';
  let search = '';
  let collapsed = false;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let editor: HTMLDialogElement | undefined;
  let menu: { node: HTMLElement; trigger: HTMLButtonElement } | undefined;

  const card = element('section', 'eze-card');
  card.setAttribute('aria-label', 'Custom fields');
  const header = element('header', 'eze-header');
  const headerText = element('div');
  const heading = element('h2', 'eze-title', 'Your fields');
  const count = element('span', 'eze-count', '0');
  heading.append(count);
  headerText.append(heading);
  const collapse = button('⌃', 'eze-icon-button eze-collapse', 'Collapse your fields');
  collapse.setAttribute('aria-expanded', 'true');
  collapse.setAttribute('aria-controls', 'eze-fields-body');
  const hidePanel = button('›', 'eze-icon-button eze-hide-panel', 'Hide EZEapply side panel');
  hidePanel.title = 'Hide EZEapply';
  const headerHidePanel = button(
    '›',
    'eze-icon-button eze-header-hide',
    'Hide EZEapply side panel',
  );
  headerHidePanel.title = 'Hide the full panel. Reopen EZEapply from the Chrome toolbar.';
  header.append(headerText, collapse, headerHidePanel);

  const body = element('div', 'eze-body');
  body.id = 'eze-fields-body';
  const subtitle = element('p', 'eze-subtitle');
  const profileName = element('span', 'eze-profile-name');
  subtitle.append(profileName);
  const toolbar = element('div', 'eze-toolbar');
  const searchInput = element('input', 'eze-search');
  searchInput.type = 'search';
  searchInput.placeholder = 'Find an answer…';
  searchInput.setAttribute('aria-label', 'Search your fields');
  const add = button('+ Add field', 'eze-button eze-primary');
  toolbar.append(searchInput, add);

  const list = element('div', 'eze-field-list');
  const drag = createFieldDragController(list, host, (sourceId, targetId, position, profileId) => {
    void reorder(sourceId, targetId, position, profileId);
  });
  const reorderHelp = element(
    'span',
    'eze-sr-only',
    'Drag to reorder within this section, or use the up and down arrow keys.',
  );
  reorderHelp.id = 'eze-reorder-help';
  const restoreFields = button('', 'eze-text-button eze-restore-fields');
  restoreFields.hidden = true;
  const sticky = element('div', 'eze-sticky');
  const barSpace = element('div', 'eze-bar-space');
  const controls = element('div', 'eze-controls');
  const toggleLabel = element('label', 'eze-auto-label');
  const auto = element('input');
  auto.type = 'checkbox';
  auto.setAttribute('role', 'switch');
  auto.setAttribute('aria-label', 'Automatically fill custom fields');
  const toggleCopy = element('span');
  toggleCopy.append(element('strong', '', 'Auto fill'));
  toggleLabel.title =
    'Automatically fill matching answers when an application page or new step appears';
  toggleLabel.append(auto, toggleCopy);
  const actions = element('div', 'eze-actions');
  const fill = button('Fill this page', 'eze-button eze-primary', 'Fill this page');
  const resume = button('Resume', 'eze-button', 'Attach saved resume');
  resume.title = 'Attach the resume saved in your profile. The website may upload it immediately.';
  const inspect = button('Questions', 'eze-button', 'Find questions');
  const undo = button('Undo', 'eze-button eze-quiet');
  undo.title = 'Undo the most recent custom-field fill on this page';
  const zoomControls = element('div', 'eze-zoom-controls');
  const zoomOut = button('−', 'eze-icon-button', 'Zoom out sidebar');
  const zoomReset = button('100%', 'eze-zoom-reset', 'Reset sidebar zoom');
  const zoomIn = button('+', 'eze-icon-button', 'Zoom in sidebar');
  zoomControls.append(zoomOut, zoomReset, zoomIn);
  const zoom = mountZoom(host, (percent) => {
    zoomReset.textContent = `${percent}%`;
    queueMicrotask(() => {
      if (!disposed) positionBar();
    });
  });
  zoomOut.addEventListener('click', () => zoom.step(-1));
  zoomIn.addEventListener('click', () => zoom.step(1));
  zoomReset.addEventListener('click', () => zoom.reset());
  const aiSettings = button(
    'AI settings',
    'eze-button eze-quiet',
    'Choose your AI provider, API key and models',
  );
  aiSettings.addEventListener('click', () => {
    void chrome.runtime
      .sendMessage({ type: 'eze-ai:open-settings' })
      .catch((error) => notify(errorText(error), true));
  });
  actions.append(fill, resume, inspect, undo, aiSettings, zoomControls);
  header.insertBefore(toggleLabel, collapse);
  controls.append(actions);
  sticky.append(header, controls);
  const reportBox = element('div', 'eze-report');
  reportBox.hidden = true;
  const footer = element('footer', 'eze-footer');
  const footerText = element('span', '', 'Saved on this device');
  const exportButton = button('Export', 'eze-text-button');
  const importButton = button('Import', 'eze-text-button');
  const importInput = element('input');
  importInput.type = 'file';
  importInput.accept = '.json,application/json';
  importInput.hidden = true;
  footer.append(footerText, exportButton, importButton, importInput);
  const status = element('div', 'eze-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  status.hidden = true;
  body.append(subtitle, toolbar, reorderHelp, reportBox, list, restoreFields, footer, status);
  card.append(barSpace, body);
  // Chrome owns the resize divider, so the hide button sits just inside the
  // extension page's edge, independently of the scrolling content.
  host.replaceChildren(hidePanel, sticky, card);
  const syncPanelSide = async (): Promise<void> => {
    try {
      const layout = await chrome.sidePanel?.getLayout?.();
      if (disposed || !layout) return;
      const left = layout.side === 'left';
      hidePanel.classList.toggle('eze-panel-left', left);
      hidePanel.textContent = left ? '‹' : '›';
      headerHidePanel.textContent = left ? '‹' : '›';
    } catch {
      /* Older Chrome and the preview use the default right edge. */
    }
  };
  void syncPanelSide();
  window.addEventListener('focus', syncPanelSide);
  // Keep the controls visible even while scrolling the profile below
  // our card. A measured spacer prevents the fixed bar from covering answers.
  const positionBar = (): void => {
    const scale =
      Number.parseFloat(document.body.style.zoom || getComputedStyle(document.body).zoom) || 1;
    hidePanel.style.top = `${window.innerHeight / scale / 2}px`;
    const rect = card.getBoundingClientRect();
    if (!rect.width) return;
    sticky.style.left = `${rect.left / scale}px`;
    sticky.style.width = `${rect.width / scale}px`;
    barSpace.style.height = `${sticky.getBoundingClientRect().height / scale}px`;
  };
  const sizeObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(positionBar) : undefined;
  sizeObserver?.observe(card);
  sizeObserver?.observe(sticky);
  window.addEventListener('resize', positionBar);
  positionBar();

  function notify(
    message: string,
    isError = false,
    action?: { label: string; run: () => Promise<void> },
  ): void {
    if (disposed) return;
    if (toastTimer) clearTimeout(toastTimer);
    status.textContent = message;
    if (action) {
      const undo = button(action.label, 'eze-text-button eze-status-action');
      undo.addEventListener('click', async () => {
        undo.disabled = true;
        try {
          await action.run();
        } catch (error) {
          notify(errorText(error), true);
        }
      });
      status.append(undo);
    }
    status.classList.toggle('eze-error', isError);
    status.hidden = false;
    if (!isError && !action)
      toastTimer = setTimeout(() => {
        status.hidden = true;
      }, 5000);
  }

  function renderFields(): void {
    closeMenu();
    drag.cancel();
    const query = search.trim().toLocaleLowerCase();
    const visible = activeFields.fields.filter(
      (field) =>
        !query ||
        [field.label, field.value, field.category, ...field.aliases].some((value) =>
          value.toLocaleLowerCase().includes(query),
        ),
    );
    count.textContent = String(activeFields.fields.length);
    const hiddenCount = activeFields.hiddenBuiltIns?.length || 0;
    restoreFields.hidden = hiddenCount === 0;
    restoreFields.textContent = `Restore hidden profile fields (${hiddenCount})`;
    list.replaceChildren();
    if (!visible.length) {
      const empty = element('div', 'eze-empty');
      empty.append(
        element('strong', '', query ? 'No matching answers' : 'Make room for your answers'),
        element(
          'p',
          '',
          query
            ? 'Try another word, or add a new field.'
            : 'Add compensation, personal questions, or any answer you reuse.',
        ),
      );
      if (!query) {
        const starter = button('Add your first field', 'eze-text-button');
        starter.addEventListener('click', () => openEditor());
        empty.append(starter);
      }
      list.append(empty);
      return;
    }
    const groups = new Map<string, CustomField[]>();
    for (const field of visible) {
      const category = field.id.startsWith('builtin:')
        ? 'From your profile'
        : field.category || 'Personal questions';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(field);
    }
    for (const [category, fields] of groups) {
      const group = element('section', 'eze-group');
      group.append(element('h3', 'eze-group-heading', category));
      for (const field of orderFields(fields, activeFields.fieldOrder)) {
        const row = element('div', 'eze-field-row');
        row.dataset.fieldId = field.id;
        row.dataset.section = category;
        const grip = button('⠿', 'eze-drag-handle', `Reorder ${field.label}`);
        grip.setAttribute('aria-describedby', reorderHelp.id);
        grip.title = 'Drag to reorder within this section. Arrow keys move up or down.';
        grip.addEventListener('pointerdown', () => closeMenu());
        drag.attach(grip, row, currentProfileId);
        grip.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            void moveByOne(field, event.key === 'ArrowUp' ? -1 : 1);
          }
        });
        const label = element('span', 'eze-field-label', field.label);
        label.title = field.label;
        if (!field.enabled) label.append(element('span', 'eze-copy-only', 'Copy only'));
        const copy = button('', 'eze-copy', `Copy ${field.label}`);
        copy.disabled = !field.value;
        const value = element('span', 'eze-field-value', field.value || 'Not set');
        value.title = field.value || 'Not set';
        const affordance = element('span', 'eze-copy-mark', '⧉');
        affordance.setAttribute('aria-hidden', 'true');
        copy.append(value, affordance);
        copy.addEventListener('click', async () => {
          try {
            await copyValue(field.value);
            notify(`${field.label} copied`);
          } catch (error) {
            notify(errorText(error), true);
          }
        });
        row.append(grip, label, copy);
        const rowActions = element('div', 'eze-row-actions');
        const more = button('⋯', 'eze-icon-button eze-more', `More options for ${field.label}`);
        more.setAttribute('aria-haspopup', 'menu');
        more.setAttribute('aria-expanded', 'false');
        more.addEventListener('click', () => openFieldMenu(field, more));
        rowActions.append(more);
        row.append(rowActions);
        group.append(row);
      }
      list.append(group);
    }
  }

  async function refresh(): Promise<void> {
    const token = ++generation;
    try {
      const [profile, fields] = await Promise.all([getProfileContext(), getActiveFields()]);
      if (disposed || token !== generation) return;
      currentProfileId = profile.id;
      activeFields = fields;
      auto.checked = fields.autoFill;
      profileName.textContent = profile.name || '';
      renderFields();
    } catch (error) {
      notify(`Could not load your fields: ${errorText(error)}`, true);
    }
  }

  async function ensureProfile(expectedId: string): Promise<void> {
    const current = await getProfileContext();
    if (current.id !== expectedId)
      throw new Error('Your profile changed. Try again for the current profile.');
  }

  function section(field: CustomField): string {
    return field.id.startsWith('builtin:')
      ? 'From your profile'
      : field.category || 'Personal questions';
  }

  function focusGrip(id: string): void {
    [...list.querySelectorAll<HTMLElement>('[data-field-id]')]
      .find((row) => row.dataset.fieldId === id)
      ?.querySelector<HTMLButtonElement>('.eze-drag-handle')
      ?.focus();
  }
  async function reorder(
    sourceId: string,
    targetId: string,
    position: 'before' | 'after',
    profileId = currentProfileId,
  ): Promise<void> {
    try {
      await ensureProfile(profileId);
      const latest = await getCustomProfile();
      const fields = (await getActiveFields()).fields;
      const source = fields.find((field) => field.id === sourceId);
      const target = fields.find((field) => field.id === targetId);
      if (!source || !target || section(source) !== section(target)) return;
      const customIds = new Set(latest.fields.map((field) => field.id));
      const retained = (latest.fieldOrder || []).filter(
        (id) => id.startsWith('builtin:') || customIds.has(id),
      );
      const ids = [...new Set([...retained, ...fields.map((field) => field.id)])];
      const fieldOrder = moveField(ids, sourceId, targetId, position);
      await saveCustomProfile({ ...latest, fieldOrder }, profileId);
      await refresh();
      focusGrip(sourceId);
      notify(`${source.label} moved ${position === 'before' ? 'above' : 'below'} ${target.label}`);
    } catch (error) {
      notify(errorText(error), true);
    }
  }
  async function moveByOne(field: CustomField, direction: -1 | 1): Promise<void> {
    const fields = orderFields(
      activeFields.fields.filter((item) => section(item) === section(field)),
      activeFields.fieldOrder,
    );
    const index = fields.findIndex((item) => item.id === field.id);
    const target = fields[index + direction];
    if (target) await reorder(field.id, target.id, direction < 0 ? 'before' : 'after');
  }

  function closeMenu(restoreFocus = false): void {
    if (!menu) return;
    const { node, trigger } = menu;
    menu = undefined;
    node.remove();
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && trigger.isConnected) trigger.focus();
  }
  const outsideMenu = (event: Event): void => {
    if (
      menu &&
      event.target instanceof Node &&
      !menu.node.contains(event.target) &&
      !menu.trigger.contains(event.target)
    )
      closeMenu();
  };
  document.addEventListener('pointerdown', outsideMenu);
  function openFieldMenu(field: CustomField, trigger: HTMLButtonElement): void {
    if (menu?.trigger === trigger) {
      closeMenu(true);
      return;
    }
    closeMenu();
    const node = element('div', 'eze-field-menu');
    node.setAttribute('role', 'menu');
    node.setAttribute('aria-label', `Options for ${field.label}`);
    const siblings = orderFields(
      activeFields.fields.filter((item) => section(item) === section(field)),
      activeFields.fieldOrder,
    );
    const index = siblings.findIndex((item) => item.id === field.id);
    const item = (
      text: string,
      label: string,
      action: () => void,
      disabled = false,
    ): HTMLButtonElement => {
      const control = button(text, 'eze-menu-item', label);
      control.setAttribute('role', 'menuitem');
      control.disabled = disabled;
      control.addEventListener('click', () => {
        closeMenu();
        action();
      });
      node.append(control);
      return control;
    };
    item('Edit answer', `Edit ${field.label}`, () => openEditor(field));
    if (activeFields.profileOverrides?.some((override) => override.id === field.id))
      item(
        'Reset to profile value',
        `Reset ${field.label} to profile value`,
        () => void resetProfileAnswer(field),
      );
    item('Move up', `Move ${field.label} up`, () => void moveByOne(field, -1), index <= 0);
    item(
      'Move down',
      `Move ${field.label} down`,
      () => void moveByOne(field, 1),
      index >= siblings.length - 1,
    );
    const builtIn = field.id.startsWith('builtin:');
    item(
      builtIn ? 'Remove from Your fields…' : 'Delete field…',
      `${builtIn ? 'Remove' : 'Delete'} ${field.label}`,
      () => confirmRemoval(field, trigger),
    ).classList.add('eze-menu-danger');
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key === 'Tab') {
        closeMenu(true);
        return;
      }
      const items = [...node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        items[
          (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        ]?.focus();
      }
    });
    host.append(node);
    menu = { node, trigger };
    trigger.setAttribute('aria-expanded', 'true');
    const anchor = trigger.getBoundingClientRect();
    const size = node.getBoundingClientRect();
    const scale = Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
    node.style.left = `${Math.max(8, Math.min(anchor.right - size.width, window.innerWidth - size.width - 8)) / scale}px`;
    node.style.top = `${Math.max(8, Math.min(anchor.bottom + 5, window.innerHeight - size.height - 8)) / scale}px`;
    node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  async function resetProfileAnswer(field: CustomField): Promise<void> {
    const profileId = currentProfileId;
    try {
      await ensureProfile(profileId);
      const profile = await getCustomProfile();
      await saveCustomProfile(
        {
          ...profile,
          profileOverrides: (profile.profileOverrides || []).filter(
            (override) => override.id !== field.id,
          ),
        },
        profileId,
      );
      await refresh();
      notify(`${field.label} reset to your profile`);
    } catch (error) {
      notify(errorText(error), true);
    }
  }

  function confirmRemoval(
    field: CustomField,
    trigger: HTMLButtonElement,
    profileId = currentProfileId,
  ): void {
    if (editor) return;
    const builtIn = field.id.startsWith('builtin:');
    const dialog = element('dialog', 'eze-dialog');
    editor = dialog;
    const content = element('div', 'eze-editor');
    const title = element('h2', '', `${builtIn ? 'Remove' : 'Delete'} ${field.label}?`);
    title.id = 'eze-removal-title';
    const explanation = element(
      'p',
      'eze-help',
      builtIn
        ? 'This hides the shortcut from Your fields. Your saved profile details stay intact, and you can restore the shortcut later.'
        : 'This deletes the saved answer. You can undo the removal immediately afterward.',
    );
    explanation.id = 'eze-removal-description';
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.setAttribute('aria-describedby', explanation.id);
    const actions = element('div', 'eze-editor-actions');
    const cancel = button('Cancel', 'eze-button');
    const confirm = button(
      builtIn ? 'Remove field' : 'Delete field',
      'eze-button eze-danger',
      `Confirm removal of ${field.label}`,
    );
    function dismiss(): void {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      dialog.remove();
      editor = undefined;
      if (trigger.isConnected) trigger.focus();
    }
    cancel.addEventListener('click', dismiss);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      dismiss();
    });
    confirm.addEventListener('click', () => {
      dismiss();
      void removeField(field, trigger, profileId);
    });
    actions.append(cancel, confirm);
    content.append(title, explanation, actions);
    dialog.append(content);
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    cancel.focus();
  }

  async function removeField(
    field: CustomField,
    trigger: HTMLButtonElement,
    profileId = currentProfileId,
  ): Promise<void> {
    trigger.disabled = true;
    try {
      await ensureProfile(profileId);
      const profile = await getCustomProfile();
      const builtIn = field.id.startsWith('builtin:');
      const index = profile.fields.findIndex((item) => item.id === field.id);
      const removed = profile.fields[index] || field;
      const next = builtIn
        ? {
            ...profile,
            hiddenBuiltIns: [...new Set([...(profile.hiddenBuiltIns || []), field.id])],
          }
        : { ...profile, fields: profile.fields.filter((item) => item.id !== field.id) };
      await saveCustomProfile(next, profileId);
      await refresh();
      notify(
        `${field.label} ${builtIn ? 'removed from your fields. Profile details kept.' : 'deleted.'}`,
        false,
        {
          label: 'Undo removal',
          run: async () => {
            await ensureProfile(profileId);
            const latest = await getCustomProfile();
            if (builtIn)
              latest.hiddenBuiltIns = (latest.hiddenBuiltIns || []).filter((id) => id !== field.id);
            else if (!latest.fields.some((item) => item.id === field.id))
              latest.fields.splice(Math.max(0, Math.min(index, latest.fields.length)), 0, removed);
            await saveCustomProfile(latest, profileId);
            await refresh();
            notify(`${field.label} restored`);
          },
        },
      );
      status.querySelector<HTMLButtonElement>('button')?.focus();
    } catch (error) {
      trigger.disabled = false;
      notify(errorText(error), true);
    }
  }

  restoreFields.addEventListener('click', async () => {
    const profileId = currentProfileId;
    restoreFields.disabled = true;
    try {
      await ensureProfile(profileId);
      const profile = await getCustomProfile();
      await saveCustomProfile({ ...profile, hiddenBuiltIns: [] }, profileId);
      await refresh();
      notify('Hidden profile fields restored');
    } catch (error) {
      notify(errorText(error), true);
    } finally {
      restoreFields.disabled = false;
    }
  });

  function openEditor(existing?: CustomField, question?: Question): void {
    closeMenu();
    if (editor) return;
    const editingProfile = currentProfileId;
    const builtIn = existing?.id.startsWith('builtin:') === true;
    const dialog = element('dialog', 'eze-dialog');
    editor = dialog;
    dialog.setAttribute('aria-labelledby', 'eze-editor-title');
    const form = element('form', 'eze-editor');
    const dialogHeader = element('div', 'eze-dialog-header');
    dialogHeader.append(element('h2', '', existing ? 'Edit field' : 'Add a field'));
    dialogHeader.firstElementChild!.id = 'eze-editor-title';
    const close = button('×', 'eze-icon-button', 'Close editor');
    dialogHeader.append(close);
    form.append(
      dialogHeader,
      element(
        'p',
        'eze-help',
        builtIn
          ? 'Use this answer for copying and autofill. Other name and phone entries keep their own values. You can reset this entry to your profile from its menu.'
          : 'Save your answer once. Click to copy it, or let matching questions use it.',
      ),
    );
    const field = <T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      labelText: string,
      control: T,
      help?: string,
    ): T => {
      const label = element('label', 'eze-input-label');
      label.append(element('span', '', labelText), control);
      if (help) label.append(element('small', 'eze-help', help));
      form.append(label);
      return control;
    };
    const template = element('select', 'eze-input');
    const blankOption = element('option', '', 'Start from a template…');
    blankOption.value = '';
    template.append(blankOption);
    for (const name of Object.keys(TEMPLATES)) {
      const option = element('option', '', name);
      option.value = name;
      template.append(option);
    }
    if (!existing) field('Quick start', template);
    const labelInput = field('Field name', element('input', 'eze-input'));
    labelInput.required = true;
    labelInput.maxLength = 200;
    labelInput.placeholder = 'e.g. Expected compensation';
    labelInput.value = existing?.label ?? question?.label ?? '';
    const valueInput = field('Your answer', element('textarea', 'eze-input eze-answer'));
    valueInput.required = !builtIn;
    valueInput.maxLength = 20000;
    valueInput.rows = 3;
    valueInput.placeholder = 'The exact answer you want copied or filled';
    valueInput.value = existing?.value ?? '';
    const aliasesInput = field(
      'Other ways the question is asked',
      element('textarea', 'eze-input'),
      'Optional: one phrase per line. Equivalent wording in your field name is matched automatically.',
    );
    aliasesInput.rows = 3;
    aliasesInput.maxLength = 10000;
    aliasesInput.placeholder = 'Expected salary\nSalary expectations\nExpected CTC';
    aliasesInput.value = existing?.aliases.join('\n') ?? '';
    const categoryInput = element('input', 'eze-input');
    if (!builtIn) field('Section', categoryInput);
    categoryInput.value = existing?.category ?? 'Personal questions';
    categoryInput.maxLength = 100;
    categoryInput.setAttribute('list', 'eze-categories');
    const categories = element('datalist');
    categories.id = 'eze-categories';
    for (const category of [
      'Personal questions',
      'Compensation',
      'Contact',
      'Links',
      'Experience',
    ]) {
      const option = element('option');
      option.value = category;
      categories.append(option);
    }
    form.append(categories);
    const enabledLabel = element('label', 'eze-checkbox-label');
    const enabledInput = element('input');
    enabledInput.type = 'checkbox';
    enabledInput.checked = existing?.enabled ?? true;
    enabledLabel.append(enabledInput, element('span', '', 'Use this answer for autofill'));
    form.append(enabledLabel);

    const advanced = element('details', 'eze-advanced');
    advanced.append(element('summary', '', 'Matching options'));
    const excludeLabel = element('label', 'eze-input-label');
    const excludeInput = element('textarea', 'eze-input');
    excludeInput.rows = 2;
    excludeInput.maxLength = 10000;
    excludeInput.value = existing?.exclude.join('\n') ?? '';
    excludeLabel.append(
      element('span', '', 'Do not match these phrases'),
      excludeInput,
      element(
        'small',
        'eze-help',
        'One per line. Useful for keeping current and expected salary separate.',
      ),
    );
    const scopeLabel = element('label', 'eze-input-label');
    const scopeInput = element('input', 'eze-input');
    scopeInput.placeholder = 'All sites, or e.g. linkedin.com';
    scopeInput.value = existing?.scope ?? '';
    scopeLabel.append(element('span', '', 'Limit to a website'), scopeInput);
    const modeLabel = element('label', 'eze-input-label');
    const mode = element('select', 'eze-input');
    for (const [value, text] of [
      ['phrase', 'Smart keywords and phrases'],
      ['exact', 'Question matches exactly'],
    ]) {
      const option = element('option', '', text);
      option.value = value;
      mode.append(option);
    }
    mode.value = existing?.matchMode ?? 'phrase';
    modeLabel.append(
      element('span', '', 'Match rule'),
      mode,
      element(
        'small',
        'eze-help',
        'Equivalent CTC, notice-period and experience wording is recognized. For CTC without amount units, a generic answer wins; otherwise your saved lakh/LPA answer is used. Keep INR and lakh variants separate. For skill-specific experience, include the skill and years/months in the field name. Values are never converted.',
      ),
    );
    advanced.append(excludeLabel, scopeLabel, modeLabel);
    form.append(advanced);
    const validation = element('p', 'eze-editor-error');
    validation.setAttribute('role', 'alert');
    validation.hidden = true;
    form.append(validation);
    const buttons = element('div', 'eze-editor-actions');
    const cancel = button('Cancel', 'eze-button');
    const save = button('Save field', 'eze-button eze-primary');
    save.type = 'submit';
    if (existing) {
      const remove = button(
        builtIn ? 'Remove from Your fields…' : 'Delete',
        'eze-button eze-danger',
      );
      remove.addEventListener('click', () => {
        dismiss();
        confirmRemoval(existing, add, editingProfile);
      });
      buttons.append(remove);
    }
    buttons.append(cancel, save);
    form.append(buttons);
    dialog.append(form);
    host.append(dialog);

    function dismiss(): void {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
      dialog.remove();
      editor = undefined;
      add.focus();
    }
    close.addEventListener('click', dismiss);
    cancel.addEventListener('click', dismiss);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      dismiss();
    });
    template.addEventListener('change', () => {
      const preset = TEMPLATES[template.value];
      if (!preset) return;
      labelInput.value = preset.label ?? '';
      aliasesInput.value = preset.aliases?.join('\n') ?? '';
      excludeInput.value = preset.exclude?.join('\n') ?? '';
      categoryInput.value = preset.category ?? 'Personal questions';
      enabledInput.checked = preset.enabled ?? true;
      valueInput.focus();
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      validation.hidden = true;
      if (!labelInput.value.trim() || (!builtIn && !valueInput.value.trim())) {
        validation.textContent = 'Add a field name and your answer.';
        validation.hidden = false;
        return;
      }
      save.disabled = true;
      try {
        let scope = scopeInput.value.trim().toLowerCase();
        if (scope) {
          const parsed = new URL(scope.includes('://') ? scope : `https://${scope}`);
          if (
            !['http:', 'https:'].includes(parsed.protocol) ||
            parsed.pathname !== '/' ||
            parsed.search ||
            parsed.hash ||
            parsed.username ||
            parsed.password ||
            parsed.port ||
            !parsed.hostname.includes('.')
          )
            throw new Error('Enter a hostname such as linkedin.com, without a path or port.');
          scope = parsed.hostname;
        }
        await ensureProfile(editingProfile);
        const next: CustomField = {
          id: existing?.id ?? crypto.randomUUID(),
          label: labelInput.value.trim(),
          value: valueInput.value.trim(),
          aliases: lines(aliasesInput.value),
          exclude: lines(excludeInput.value),
          category: categoryInput.value.trim() || 'Personal questions',
          enabled: enabledInput.checked,
          matchMode: mode.value === 'exact' ? 'exact' : 'phrase',
          scope,
        };
        const profile = await getCustomProfile();
        if (builtIn) {
          const profileOverrides = [
            ...(profile.profileOverrides || []).filter((item) => item.id !== next.id),
            next,
          ];
          await saveCustomProfile({ ...profile, profileOverrides }, editingProfile);
        } else {
          const fields = existing
            ? profile.fields.map((item) => (item.id === existing.id ? next : item))
            : [...profile.fields, next];
          await saveCustomProfile({ ...profile, fields }, editingProfile);
        }
        dismiss();
        await refresh();
        notify(`${next.label} saved`);
      } catch (error) {
        validation.textContent = errorText(error);
        validation.hidden = false;
        save.disabled = false;
      }
    });
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    (existing || question ? valueInput : labelInput).focus();
  }

  function renderReport(report: FillReport, action: string): void {
    reportBox.replaceChildren();
    reportBox.hidden = false;
    const titleRow = element('div', 'eze-report-title');
    const title =
      action === 'scan'
        ? 'Questions on this page'
        : action === 'attach-resume'
          ? `Attached ${report.filled} ${report.filled === 1 ? 'resume' : 'resumes'}`
          : action === 'undo'
            ? `Restored ${report.filled} ${report.filled === 1 ? 'field' : 'fields'}`
            : `Filled ${report.filled} ${report.filled === 1 ? 'field' : 'fields'}`;
    titleRow.append(element('strong', '', title));
    const dismiss = button('×', 'eze-icon-button', 'Dismiss page results');
    dismiss.addEventListener('click', () => {
      reportBox.hidden = true;
    });
    titleRow.append(dismiss);
    reportBox.append(titleRow);
    if (report.error) {
      reportBox.append(element('p', 'eze-editor-error', report.error));
      return;
    }
    for (const warning of report.warnings || [])
      reportBox.append(element('p', 'eze-help', warning));
    if (action === 'undo') {
      reportBox.append(
        element(
          'p',
          'eze-help',
          report.filled
            ? 'The most recent custom-field changes were restored. Answers you edited afterward are kept.'
            : 'No recent custom-field changes could be restored. Answers you edited afterward are kept.',
        ),
      );
      return;
    }
    const unanswered = report.questions.filter((question) => !question.filled);
    if (!report.questions.length)
      reportBox.append(
        element(
          'p',
          'eze-help',
          'No supported form fields found. Open an application form and try again.',
        ),
      );
    else if (action !== 'scan')
      reportBox.append(
        element('p', 'eze-help', 'Existing answers are kept. Review the form before continuing.'),
      );
    if (!unanswered.length && action === 'scan' && report.questions.length)
      reportBox.append(element('p', 'eze-help', 'The detected questions already have answers.'));
    const questionList = element('div', 'eze-questions');
    for (const question of unanswered) {
      const item = element('div', 'eze-question');
      const content = element('div');
      content.append(element('span', '', question.label));
      if (question.reason) content.append(element('small', 'eze-help', question.reason));
      const questionActions = element('div', 'eze-question-actions');
      const matchingField = activeFields.fields.find((field) => field.id === question.matchedField);
      if (question.kind === 'file') {
        const attach = button('Attach resume', 'eze-text-button');
        attach.addEventListener('click', () => void dispatch('attach-resume'));
        questionActions.append(attach);
      } else if (matchingField) {
        content.append(element('small', 'eze-help', `Saved field: ${matchingField.label}`));
        const copyAnswer = button(
          'Copy answer',
          'eze-text-button',
          `Copy saved answer for ${question.label}`,
        );
        copyAnswer.disabled = !matchingField.value;
        copyAnswer.addEventListener('click', async () => {
          try {
            await copyValue(matchingField.value);
            notify(`${matchingField.label} copied`);
          } catch (error) {
            notify(errorText(error), true);
          }
        });
        questionActions.append(copyAnswer);
        if (!matchingField.id.startsWith('builtin:')) {
          const editAnswer = button(
            'Edit answer',
            'eze-text-button',
            `Edit matching field for ${question.label}`,
          );
          editAnswer.addEventListener('click', () => openEditor(matchingField));
          questionActions.append(editAnswer);
        } else {
          const saveVariant = button(
            'Add variant',
            'eze-text-button',
            `Add answer variant for ${question.label}`,
          );
          saveVariant.addEventListener('click', () => openEditor(undefined, question));
          questionActions.append(saveVariant);
        }
      } else {
        const saveAnswer = button(
          'Save answer',
          'eze-text-button',
          `Save answer for ${question.label}`,
        );
        saveAnswer.addEventListener('click', () => openEditor(undefined, question));
        questionActions.append(saveAnswer);
      }
      if (question.canDraftWithAI) {
        const draft = button(
          '✦ Draft with AI',
          'eze-text-button eze-ai-draft',
          `Draft AI answer for ${question.label}`,
        );
        draft.title = 'Use your AI provider and saved applicant context; review before filling';
        draft.addEventListener('click', async () => {
          draft.disabled = true;
          try {
            const result = (await chrome.runtime.sendMessage({
              type: 'eze-custom:open-ai',
              tabId: report.tabId,
              questionId: question.id,
              questionLabel: question.label,
              documentId: question.documentId,
            })) as { ok?: boolean; error?: string } | undefined;
            if (!result?.ok)
              throw new Error(
                result?.error ||
                  'Could not open the AI draft. Refresh this application page and try again.',
              );
            notify('AI draft opened on the form. Generate and review your answer there.');
          } catch (error) {
            notify(errorText(error), true);
          } finally {
            draft.disabled = false;
          }
        });
        questionActions.append(draft);
      }
      item.append(content, questionActions);
      questionList.append(item);
    }
    reportBox.append(questionList);
  }

  async function dispatch(action: 'scan' | 'fill' | 'undo' | 'attach-resume'): Promise<void> {
    fill.disabled = resume.disabled = inspect.disabled = undo.disabled = true;
    try {
      const report = (await chrome.runtime.sendMessage({ type: 'eze-custom:dispatch', action })) as
        | FillReport
        | undefined;
      if (report?.error && !Array.isArray(report.questions)) throw new Error(report.error);
      if (!report || typeof report.filled !== 'number' || !Array.isArray(report.questions))
        throw new Error('Could not reach this page. Refresh the application tab and try again.');
      renderReport(report, action);
    } catch (error) {
      notify(errorText(error), true);
    } finally {
      fill.disabled = resume.disabled = inspect.disabled = undo.disabled = false;
    }
  }

  collapse.addEventListener('click', () => {
    collapsed = !collapsed;
    body.hidden = collapsed;
    controls.hidden = collapsed;
    collapse.textContent = collapsed ? '⌄' : '⌃';
    collapse.setAttribute('aria-expanded', String(!collapsed));
    collapse.setAttribute('aria-label', collapsed ? 'Expand your fields' : 'Collapse your fields');
  });
  add.addEventListener('click', () => openEditor());
  searchInput.addEventListener('input', () => {
    search = searchInput.value;
    renderFields();
  });
  auto.addEventListener('change', async () => {
    auto.disabled = true;
    const desired = auto.checked;
    const expectedProfileId = currentProfileId;
    try {
      await setAutoFillPreference(desired, expectedProfileId);
      await refresh();
    } catch (error) {
      auto.checked = !desired;
      notify(errorText(error), true);
    } finally {
      auto.disabled = false;
    }
  });
  const hideButtons = [hidePanel, headerHidePanel];
  const hideFullPanel = async (): Promise<void> => {
    hideButtons.forEach((control) => {
      control.disabled = true;
    });
    try {
      const result = await chrome.runtime.sendMessage({ type: 'eze-custom:hide-panel' });
      if (!result?.ok)
        throw new Error(
          result?.error ||
            'Use the Chrome close button, then reopen EZEapply from its toolbar icon.',
        );
    } catch (error) {
      notify(errorText(error), true);
    } finally {
      hideButtons.forEach((control) => {
        control.disabled = false;
      });
    }
  };
  hideButtons.forEach((control) => control.addEventListener('click', hideFullPanel));
  fill.addEventListener('click', () => void dispatch('fill'));
  resume.addEventListener('click', () => void dispatch('attach-resume'));
  inspect.addEventListener('click', () => void dispatch('scan'));
  undo.addEventListener('click', () => void dispatch('undo'));
  exportButton.addEventListener('click', async () => {
    const expectedProfileId = currentProfileId;
    try {
      const profile = await getCustomProfile();
      await ensureProfile(expectedProfileId);
      const blob = new Blob([JSON.stringify({ version: 1, ...profile }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = element('a');
      anchor.href = url;
      anchor.download = 'custom-fields.json';
      host.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Exported your custom fields. Keep the file private.');
    } catch (error) {
      notify(`Could not export: ${errorText(error)}`, true);
    }
  });
  importButton.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const expectedProfileId = currentProfileId;
    try {
      if (file.size > 5_000_000)
        throw new Error('This file is too large. Choose a custom-fields JSON export under 5 MB.');
      const imported = parseImport(await file.text());
      const profile = await getCustomProfile();
      await ensureProfile(expectedProfileId);
      const ids = new Set(profile.fields.map((item) => item.id));
      const existing = new Set(profile.fields.map((item) => `${item.label}\u0000${item.value}`));
      const added = imported.fields
        .filter((item) => !existing.has(`${item.label}\u0000${item.value}`))
        .map((item) => {
          const id = ids.has(item.id) ? crypto.randomUUID() : item.id;
          ids.add(id);
          return { ...item, id };
        });
      await saveCustomProfile(
        {
          ...profile,
          fields: [...profile.fields, ...added],
          ...(imported.hiddenBuiltIns
            ? {
                hiddenBuiltIns: [
                  ...new Set([...(profile.hiddenBuiltIns || []), ...imported.hiddenBuiltIns]),
                ],
              }
            : {}),
          ...(imported.fieldOrder
            ? { fieldOrder: [...new Set([...(profile.fieldOrder || []), ...imported.fieldOrder])] }
            : {}),
        },
        expectedProfileId,
      );
      await refresh();
      notify(
        `Imported ${added.length} ${added.length === 1 ? 'field' : 'fields'}. Your existing answers were kept.`,
      );
    } catch (error) {
      notify(`Could not import: ${errorText(error)}`, true);
    } finally {
      importInput.value = '';
    }
  });
  const onStorage = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (
      areaName === 'local' &&
      (changes[STORAGE_KEY] || changes.profile || changes.lastSyncProfile || changes.profiles)
    )
      void refresh();
  };
  chrome.storage.onChanged.addListener(onStorage);
  await refresh();
  return () => {
    disposed = true;
    chrome.storage.onChanged.removeListener(onStorage);
    document.removeEventListener('pointerdown', outsideMenu);
    closeMenu();
    drag.destroy();
    zoom.dispose();
    sizeObserver?.disconnect();
    window.removeEventListener('resize', positionBar);
    window.removeEventListener('focus', syncPanelSide);
    if (toastTimer) clearTimeout(toastTimer);
    editor?.remove();
    host.replaceChildren();
  };
}

const root = typeof document !== 'undefined' ? document.getElementById('eze-custom-root') : null;
if (root && typeof chrome !== 'undefined') void mountPanel(root);
