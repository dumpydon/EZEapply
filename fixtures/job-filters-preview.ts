import { mountLinkedInJobFilters } from '../src/linkedin-job-filters';

const pages = [
  [
    ['109', 'AI video Editor', 'Example Media'],
    ['110', 'AI Editorial Engineer', 'Example Studio'],
    ['105', 'Senior Data Engineer', 'Example Data'],
    ['106', 'Data & AI Engineer', 'Example Labs'],
    ['101', 'Machine Learning Engineer', 'Jobgether'],
    ['107', 'Research Scientist', 'Jobgether'],
    ['108', 'Research Engineer', 'Jobgether Partners'],
    ['102', 'AI Sales Executive', 'Example Analytics'],
    ['103', 'Research Assistant – Drones & Robotics', 'Example Research Lab'],
    ['104', 'Salesforce Developer', 'Example Software'],
  ],
  [
    ['201', 'Presales Executive', 'Example Technology'],
    ['202', 'Data Scientist', 'Crossing Hurdles'],
    ['203', 'Business Development Associate', 'Example Studio'],
    ['204', 'Site Reliability Engineer', 'Example Networks'],
    ['205', 'Data and AI Engineer', 'Example Systems'],
  ],
];
const list = document.getElementById('results')!;
const pageButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-page]')];
const output = document.querySelector('output')!;
const dismissed = new Set<string>();
let ignoredEditorClick = false;
function render() {
  const page = new URL(location.href).searchParams.get('start') === '25' ? 1 : 0;
  list.replaceChildren();
  for (const [id, title, company] of pages[page]) {
    const card = document.createElement('article');
    card.setAttribute('componentkey', `job-card-component-ref-${id}`);
    const opener = document.createElement('div');
    opener.setAttribute('role', 'button');
    const name = document.createElement('p');
    name.className = 'card-title';
    const accessibleTitle = document.createElement('span');
    accessibleTitle.className = 'visually-hidden';
    accessibleTitle.textContent = `${title} (Verified job)`;
    const displayedTitle = document.createElement('span');
    displayedTitle.setAttribute('aria-hidden', 'true');
    displayedTitle.textContent = title;
    name.append(accessibleTitle, displayedTitle);
    const titleGroup = document.createElement('div');
    titleGroup.append(name);
    const employerGroup = document.createElement('div');
    const employer = document.createElement('p');
    employer.textContent = company;
    employerGroup.append(employer);
    const location = document.createElement('p');
    location.textContent = 'Remote';
    const info = document.createElement('p');
    info.className = 'dismissed-caption';
    info.textContent = 'Dismissed from recommendations.';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'card-action';
    function paint() {
      const skipped = dismissed.has(id);
      card.classList.toggle('dismissed', skipped);
      info.hidden = !skipped;
      action.textContent = skipped ? '↶' : '×';
      action.setAttribute(
        'aria-label',
        skipped ? `${title} job is dismissed, undo` : `Dismiss ${title} job`,
      );
      const count = pages[page].filter(([id]) => dismissed.has(id)).length;
      output.textContent = `Page ${page + 1} · ${count} dismissed`;
    }
    action.addEventListener('click', () => {
      // Reproduce a dropped native Dismiss click for the regression preview.
      if (id === '109' && !ignoredEditorClick) {
        ignoredEditorClick = true;
        return;
      }
      if (dismissed.has(id)) dismissed.delete(id);
      else dismissed.add(id);
      paint();
    });
    opener.append(titleGroup, employerGroup, location);
    card.append(opener, info, action);
    list.append(card);
    paint();
  }
  for (const button of pageButtons) {
    if (Number(button.dataset.page) === page) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}
for (const button of pageButtons)
  button.addEventListener('click', () => {
    history.pushState({}, '', `?start=${button.dataset.page === '1' ? 25 : 0}`);
    render();
  });
window.addEventListener('popstate', render);
render();
mountLinkedInJobFilters();
