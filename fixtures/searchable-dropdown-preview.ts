import { searchableWidget } from './searchable-widget';
const form = document.querySelector<HTMLElement>('#job-application')!,
  output = document.querySelector<HTMLOutputElement>('#committed')!;
let step = 0,
  widgets: ReturnType<typeof searchableWidget>[] = [];
function report() {
  output.textContent = `Step ${step} · Committed gender: ${widgets[0]?.value || 'empty'} · Committed country: ${widgets[1]?.value || 'empty'} · Option selections: ${widgets.reduce((sum, widget) => sum + widget.selections, 0)}`;
}
function render() {
  step++;
  form.innerHTML =
    '<div class="form-group"><label for="first-name">First name</label><input id="first-name" autocomplete="given-name"></div><div class="form-group"><label for="phone">Mobile number</label><input id="phone" type="tel" autocomplete="tel-national"></div>';
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
