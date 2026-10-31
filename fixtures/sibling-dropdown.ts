/** Synthetic ATS pattern: hidden native select, trigger, then an adjacent popup
 * owning its listbox. Only the site's option handler commits a selection. */
export function siblingDropdown(
  container: HTMLElement,
  { label = 'Prefix', activeDescendant = false, rejectSelection = false } = {},
) {
  const doc = container.ownerDocument;
  const group = doc.createElement('div');
  group.className = 'form-group';
  group.innerHTML = `<label>${label}</label><select hidden aria-label="${label}"><option value="-1">— Make a Selection —</option></select>
    <a role="combobox" tabindex="0" aria-label="${label}" aria-expanded="false"><span>— Make a Selection —</span></a>
    <div hidden aria-expanded="false"><ul role="listbox"></ul></div>`;
  container.append(group);
  const select = group.querySelector('select')!;
  const control = group.querySelector<HTMLElement>('[role="combobox"]')!;
  const popup = control.nextElementSibling as HTMLElement;
  const list = popup.querySelector('ul')!;
  const id = `sibling-${doc.querySelectorAll('[role="listbox"]').length}`;
  list.id = `${id}-options`;
  popup.setAttribute('aria-owns', list.id);
  let selections = 0;
  for (const [index, label] of ['Ms. / Miss / Mrs.', 'Mr.', 'Other'].entries()) {
    const option = doc.createElement('li');
    option.id = `${id}-${index}`;
    option.role = 'option';
    option.textContent = label;
    option.addEventListener('click', () => {
      if (rejectSelection) return;
      selections++;
      select.replaceChildren(new Option(label, String(index + 100), true, true));
      control.querySelector('span')!.textContent = label;
      option.setAttribute('aria-selected', 'true');
      control.setAttribute('aria-expanded', 'false');
      popup.hidden = true;
      popup.setAttribute('aria-expanded', 'false');
      select.dispatchEvent(new doc.defaultView!.Event('change', { bubbles: true }));
    });
    list.append(option);
  }
  if (activeDescendant) control.setAttribute('aria-activedescendant', `${id}-0`);
  control.addEventListener('click', () => {
    popup.hidden = false;
    popup.setAttribute('aria-expanded', 'true');
    control.setAttribute('aria-expanded', 'true');
  });
  return {
    group,
    control,
    popup,
    list,
    select,
    get selections() {
      return selections;
    },
  };
}
