/** Sanitized Choices-style web component fixture. This is test/preview code,
 * never part of the extension. State changes only through option handlers. */
export function searchableWidget(
  container: HTMLElement,
  choices = ['Male', 'Female', 'Other'],
  configuration: {
    searchableOnly?: boolean;
    rejectSelection?: boolean;
    delay?: number;
    label?: string;
  } = {},
) {
  const root = container.ownerDocument,
    group = root.createElement('div');
  group.className = 'form-group';
  const label = root.createElement('label');
  label.textContent = configuration.label || 'Gender *';
  const wrap = root.createElement('div'),
    host = root.createElement('example-dropdown');
  wrap.className = 'dropdown';
  wrap.append(host);
  group.append(label, wrap);
  container.append(group);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>[hidden]{display:none!important}.choices__list--dropdown[aria-expanded="false"]{display:none!important}.choices__inner{border:1px solid #9faeb8;border-radius:6px;padding:10px;cursor:pointer}.choices input[type="search"]{border:0;width:100%;padding:0;min-height:26px;font:inherit}.choices__list--dropdown{border:1px solid #9faeb8;border-radius:6px;background:white;color:#25332c}.choices__item--choice{padding:10px 12px;cursor:pointer}.choices__item--choice:hover{background:#e3f2ed}.dbx-placeholder-fix{color:#6d7f89}[data-item]{display:inline-block;padding:3px 0}</style>
    <div class="is-single-select main-container"><div class="dropdown-wrapper"><div class="dropdown-container">
    <div class="choices" data-type="select-one" tabindex="0" role="combobox" aria-autocomplete="list" aria-haspopup="true" aria-expanded="false">
      <div class="choices__inner" part="dropdown_box"><select hidden tabindex="-1" data-choice="active"></select>
        <div class="choices__list choices__list--single" part="dbx-dropdown-selected-text"><div class="dbx-placeholder-fix">Search and Select</div><input type="search" class="choices__input choices__input--cloned" hidden autocomplete="off" role="textbox" aria-label="Search and Select" placeholder="Search and Select"></div>
      </div>
      <div class="choices__list choices__list--dropdown" aria-expanded="false"><div class="choices__list" role="listbox"></div></div>
    </div></div></div></div>`;
  const control = shadow.querySelector<HTMLElement>('[role="combobox"]')!,
    input = shadow.querySelector<HTMLInputElement>('input[type="search"]')!,
    select = shadow.querySelector('select')!,
    list = shadow.querySelector<HTMLElement>('[role="listbox"]')!,
    popup = list.parentElement!;
  let committed = '',
    selections = 0;
  function options(query = '') {
    list.replaceChildren();
    const matches = choices.filter((choice) => choice.toLowerCase().includes(query.toLowerCase()));
    for (const [index, choice] of matches.entries()) {
      const option = root.createElement('div');
      option.setAttribute('role', 'option');
      option.className = 'choices__item choices__item--choice choices__item--selectable';
      option.setAttribute('data-choice', '');
      option.setAttribute('data-id', String(index + 1));
      option.setAttribute('data-value', String(choices.indexOf(choice) + 1));
      // Choices uses aria-selected for the highlighted search result, even
      // before an applicant has actually selected anything.
      if (index === 0) {
        option.classList.add('is-highlighted');
        option.setAttribute('aria-selected', 'true');
      }
      const checkbox = root.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.display = 'none';
      checkbox.tabIndex = -1;
      const text = root.createElement('div');
      text.className = 'select_lable';
      text.textContent = choice;
      option.append(checkbox, text);
      option.addEventListener('mousedown', (event) => {
        if (event.button !== 0 || configuration.rejectSelection) return;
        selections++;
        committed = choice;
        select.replaceChildren(new Option(choice, option.dataset.value, true, true));
        const selected = root.createElement('div');
        selected.className = 'choices__item choices__item--selectable';
        selected.setAttribute('data-item', '');
        selected.dataset.value = option.dataset.value;
        selected.textContent = choice;
        shadow.querySelector('.dbx-placeholder-fix')?.remove();
        shadow.querySelector('[data-item]')?.remove();
        input.before(selected);
        input.value = '';
        input.hidden = true;
        control.setAttribute('aria-expanded', 'false');
        popup.setAttribute('aria-expanded', 'false');
        select.dispatchEvent(
          new root.defaultView!.Event('change', { bubbles: true, composed: true }),
        );
        event.preventDefault();
      });
      list.append(option);
    }
  }
  control.addEventListener('click', (event) => {
    if ((event.target as Element).closest('[role="option"]')) return;
    control.setAttribute('aria-expanded', 'true');
    popup.setAttribute('aria-expanded', 'true');
    input.hidden = false;
    input.focus();
    if (!configuration.searchableOnly) options(input.value);
  });
  // This widget, like Choices, filters from keyup; input alone isn't enough.
  input.addEventListener('keyup', () => {
    root.defaultView!.setTimeout(() => options(input.value), configuration.delay || 0);
  });
  control.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      control.setAttribute('aria-expanded', 'false');
      popup.setAttribute('aria-expanded', 'false');
      input.hidden = true;
    }
  });
  if (!configuration.searchableOnly) options();
  return {
    control,
    input,
    select,
    list,
    popup,
    host,
    group,
    get value() {
      return committed;
    },
    get selections() {
      return selections;
    },
  };
}
