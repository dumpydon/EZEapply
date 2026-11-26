import { JOB_FILTERS_KEY, keepRuleTerms, readJobFilters } from './job-filter-rules';
import { navigationIcon } from './navigation-icon';

const filterFields = [
  {
    key: 'titles',
    label: 'Job titles',
    description: 'Match whole title phrases',
    listLabel: 'Title phrases',
    placeholder: 'Data Engineer&#10;Sales',
    empty: 'Add a title phrase to enable Job titles.',
  },
  {
    key: 'companies',
    label: 'Job companies',
    description: 'Match full company names',
    listLabel: 'Company names',
    placeholder: 'Jobgether&#10;Crossing Hurdles',
    empty: 'Add a company name to enable Job companies.',
  },
  {
    key: 'exceptions',
    label: 'Keep exceptions',
    description: 'Override matching title rules',
    listLabel: 'Keep rules',
    placeholder: 'Intern + Remote',
    empty: 'Add a rule to enable Keep exceptions.',
  },
] as const;

export function mountJobFilters(): { button: HTMLButtonElement; dispose(): void } {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'popup-shortcut job-filters-shortcut';
  button.title = 'Job Filters';
  button.setAttribute('aria-label', 'Job Filters');
  button.setAttribute('aria-haspopup', 'dialog');
  button.append(navigationIcon('job-filters'));

  let editor: HTMLDialogElement | undefined;
  let disposed = false;
  let revision = 0;
  let settings = readJobFilters(undefined);
  function paint(raw: unknown) {
    settings = readJobFilters(raw);
    const active = settings.titles.enabled || settings.companies.enabled;
    button.title = active ? 'Job Filters (on)' : 'Job Filters';
    button.dataset.enabled = String(active);
  }
  async function refresh() {
    const before = revision;
    const data = await chrome.storage.local.get(JOB_FILTERS_KEY);
    if (!disposed && revision === before) paint(data[JOB_FILTERS_KEY]);
  }
  const changed: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (disposed || area !== 'local' || !changes[JOB_FILTERS_KEY]) return;
    revision++;
    paint(changes[JOB_FILTERS_KEY].newValue);
  };
  chrome.storage.onChanged.addListener(changed);
  void refresh().catch(() => {});

  button.addEventListener('click', () => {
    if (editor || disposed) return;
    const dialog = document.createElement('dialog');
    editor = dialog;
    dialog.className = 'job-filters-dialog';
    dialog.setAttribute('aria-labelledby', 'job-filters-title');
    const form = document.createElement('form');
    form.innerHTML = `
      <header class="job-filters-heading">
        <div class="job-filters-heading-text">
          <div class="job-filters-heading-row">
            <h2 id="job-filters-title" tabindex="-1">Job Filters</h2>
            <button type="button" class="job-filter-expand job-filter-exceptions-link"
              aria-expanded="false" aria-controls="job-filter-exceptions-group" disabled>Keep exceptions</button>
          </div>
          <p>Auto-dismiss matching LinkedIn jobs</p>
        </div>
      </header>
      <div class="job-filters-lists">
        ${filterFields
          .map(
            ({ key, label, description, listLabel, placeholder }) => `
          <section class="job-filter-group" id="job-filter-${key}-group"
            aria-labelledby="job-filter-${key}-heading" ${key === 'exceptions' ? 'hidden' : ''}>
            <header class="job-filter-group-heading">
              <div>
                <h3 id="job-filter-${key}-heading">${label}</h3>
                <p id="job-filter-${key}-description">${description}</p>
              </div>
              <label class="job-filter-switch">
                <input name="${key}-enabled" type="checkbox" role="switch"
                  aria-labelledby="job-filter-${key}-heading"
                  aria-describedby="job-filter-${key}-description" disabled>
                <span class="job-filter-switch-track" aria-hidden="true">
                  <span class="job-filter-off">Off</span>
                  <span class="job-filter-on">On</span>
                </span>
              </label>
            </header>
            <div class="job-filter-field-heading">
              <label for="job-filter-${key}-list">${listLabel}</label>
              <small id="job-filter-${key}-hint">One per line</small>
              ${
                key === 'exceptions'
                  ? ''
                  : `<button type="button" class="job-filter-expand" aria-expanded="false"
                aria-label="Expand ${listLabel.toLowerCase()}" aria-controls="job-filter-${key}-list"
                disabled>Expand</button>`
              }
            </div>
            <div class="job-filter-editor">
              <textarea id="job-filter-${key}-list" rows="5" maxlength="5000"
                placeholder="${placeholder}" aria-describedby="job-filter-${key}-hint${key === 'exceptions' ? ' job-filter-keep-help job-filter-keep-priority' : ''}" disabled></textarea>
            </div>
            ${
              key === 'exceptions'
                ? `<p class="job-filter-keep-help" id="job-filter-keep-help">Join required phrases with a spaced +. Each phrase can match the title or location shown on the card.</p>
              <p class="job-filter-keep-help" id="job-filter-keep-priority">Company filters always take priority.</p>`
                : ''
            }
          </section>`,
          )
          .join('')}
      </div>
      <footer class="job-filters-footer">
        <p class="job-filters-error" role="alert" hidden></p>
        <p>Restore listings with LinkedIn’s Undo.</p>
        <div class="job-filters-actions">
          <button type="button">Cancel</button>
          <button type="submit" disabled>Save filters</button>
        </div>
      </footer>`;
    form.querySelector('.job-filters-heading')!.prepend(navigationIcon('job-filters'));
    const lists = form.querySelector<HTMLElement>('.job-filters-lists')!;
    const fields = filterFields.map((field) => {
      const group = lists.querySelector<HTMLElement>(
        `[aria-labelledby="job-filter-${field.key}-heading"]`,
      )!;
      return {
        ...field,
        group,
        toggle: group.querySelector<HTMLInputElement>('input')!,
        list: group.querySelector<HTMLTextAreaElement>('textarea')!,
        expand:
          field.key === 'exceptions'
            ? form.querySelector<HTMLButtonElement>('.job-filter-exceptions-link')!
            : group.querySelector<HTMLButtonElement>('.job-filter-expand')!,
      };
    });
    let expanded: (typeof fields)[number] | undefined;
    const error = form.querySelector<HTMLElement>('[role="alert"]')!;
    const cancel = form.querySelector<HTMLButtonElement>(
      '.job-filters-actions button[type="button"]',
    )!;
    const save = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    dialog.append(form);
    document.body.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    form.querySelector<HTMLElement>('h2')!.focus();

    const showError = (message: string) => {
      error.textContent = message;
      error.hidden = !message;
    };
    const setEditingDisabled = (disabled: boolean) => {
      for (const { toggle, list, expand } of fields)
        toggle.disabled = list.disabled = expand.disabled = disabled;
      save.disabled = disabled;
    };
    const setExpanded = (next?: (typeof fields)[number]) => {
      expanded = next;
      dialog.toggleAttribute('data-expanded', Boolean(next));
      for (const field of fields) {
        const isExpanded = next === field;
        const action = isExpanded ? 'Collapse' : 'Expand';
        field.group.hidden = next ? !isExpanded : field.key === 'exceptions';
        field.expand.setAttribute('aria-expanded', String(isExpanded));
        if (field.key === 'exceptions') {
          field.expand.textContent = isExpanded ? 'Back to filters' : 'Keep exceptions';
        } else {
          field.expand.setAttribute('aria-label', `${action} ${field.listLabel.toLowerCase()}`);
          field.expand.textContent = action;
        }
      }
      if (next) lists.scrollTop = 0;
    };
    for (const field of fields) {
      field.expand.addEventListener('click', () =>
        setExpanded(expanded === field ? undefined : field),
      );
    }
    const close = () => {
      dialog.close?.();
      dialog.remove();
      editor = undefined;
      button.focus();
    };
    cancel.addEventListener('click', close);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (cancel.disabled) return;
      if (expanded) {
        const { expand } = expanded;
        setExpanded();
        expand.focus();
      } else close();
    });
    void refresh()
      .then(() => {
        if (!dialog.isConnected) return;
        for (const { key, toggle, list } of fields) {
          toggle.checked = settings[key].enabled;
          list.value = settings[key].keywords.join('\n');
        }
        setEditingDisabled(false);
      })
      .catch(() => {
        if (dialog.isConnected) showError('Could not load your filters. Close and try again.');
      });
    function clearError() {
      for (const { list } of fields) list.removeAttribute('aria-invalid');
      showError('');
    }
    form.addEventListener('input', clearError);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (save.disabled) return;
      const drafts = Object.fromEntries(
        fields.map(({ key, toggle, list }) => [
          key,
          { enabled: toggle.checked, keywords: list.value.split(/[\r\n]+/) },
        ]),
      );
      const next = readJobFilters(drafts);
      clearError();
      const invalidRule = drafts.exceptions.keywords.some(
        (rule) => rule.trim() && !keepRuleTerms(rule).length,
      );
      const invalid = fields.find(
        ({ key, toggle }) =>
          (key === 'exceptions' && invalidRule) || (toggle.checked && !next[key].keywords.length),
      );
      if (invalid) {
        showError(
          invalid.key === 'exceptions' && invalidRule
            ? 'Enter a phrase on each side of +, or use a single phrase.'
            : invalid.empty,
        );
        if (invalid.group.hidden) setExpanded(invalid);
        invalid.list.setAttribute('aria-invalid', 'true');
        invalid.list.focus();
        return;
      }
      setEditingDisabled(true);
      cancel.disabled = true;
      const before = revision;
      try {
        await chrome.storage.local.set({ [JOB_FILTERS_KEY]: next });
        if (!disposed && revision === before) paint(next);
        if (dialog.isConnected) close();
      } catch {
        if (!dialog.isConnected) return;
        setEditingDisabled(false);
        cancel.disabled = false;
        showError('Could not save your filters. Try again.');
      }
    });
  });

  return {
    button,
    dispose() {
      disposed = true;
      editor?.remove();
      chrome.storage.onChanged.removeListener(changed);
    },
  };
}
