import { searchableWidget } from './searchable-widget';
import { siblingDropdown } from './sibling-dropdown';
const form = document.querySelector<HTMLElement>('#job-application')!,
  output = document.querySelector<HTMLOutputElement>('#committed')!;
let step = 0,
  widgets: ReturnType<typeof searchableWidget>[] = [];
let prefix: ReturnType<typeof siblingDropdown>;
function report() {
  const native = form.querySelector<HTMLSelectElement>('#native-prefix')!;
  output.textContent = `Step ${step} · Native prefix: ${native.value === '-1' ? 'empty' : native.selectedOptions[0].textContent} · Custom prefix: ${prefix?.select.value === '-1' ? 'empty' : prefix?.select.selectedOptions[0].textContent} · Committed gender: ${widgets[0]?.value || 'empty'} · Committed country: ${widgets[1]?.value || 'empty'} · Option selections: ${widgets.reduce((sum, widget) => sum + widget.selections, 0) + (prefix?.selections || 0)}`;
}
function render() {
  step++;
  form.innerHTML =
    '<div class="form-group"><label for="native-prefix">Prefix (native dropdown)</label><select id="native-prefix"><option value="-1">— Make a Selection —</option><option value="1">Ms. / Miss / Mrs.</option><option value="2">Mr.</option><option value="3">Other</option></select></div><div class="form-group"><label for="first-name">First name</label><input id="first-name" autocomplete="given-name"></div><div class="form-group"><label for="phone">Mobile number</label><input id="phone" type="tel" autocomplete="tel-national"></div>';
  prefix = siblingDropdown(form);
  prefix.select.addEventListener('change', report);
  form.querySelector('#native-prefix')!.addEventListener('change', report);
  widgets = [
    searchableWidget(form),
    searchableWidget(form, ['India', 'Indonesia'], {
      label: 'Country',
      searchableOnly: true,
      delay: 350,
    }),
  ];
  for (const widget of widgets) widget.select.addEventListener('change', report);
  report();
}
document.querySelector('#reveal-step')!.addEventListener('click', render);
render();
