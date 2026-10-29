// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { fillForm, fillFormWithWidgets, scanForm, undoFill, isJobContext } from '../src/content';
import { builtInFields } from '../src/storage';
import { profileAutofillFields } from '../src/profile-fields';
import type { CustomField } from '../src/types';
const profile = {
  nameData: { firstName: 'Alex', lastName: 'Sharma' },
  contactData: { email: 'alex@example.test' },
  addressData: {
    line1: '42 Example Road',
    line2: 'Suite 5',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'India',
  },
  websiteData: {
    linkedin: 'https://www.linkedin.com/in/alex-example/',
    github: 'https://github.com/alex-example',
    personal: 'https://alex.example.test',
  },
  skillsData: ['Python', 'TypeScript'],
};
const fields: CustomField[] = [
  ...builtInFields({
    id: 'local',
    name: 'Alex',
    personal: { firstName: 'Alex', lastName: 'Sharma' },
  }).map((field) => ({
    ...field,
    autocomplete:
      field.id === 'builtin:first'
        ? ['given-name']
        : field.id === 'builtin:last'
          ? ['family-name']
          : [],
  })),
  ...profileAutofillFields(profile),
];
beforeEach(() => document.body.replaceChildren());
afterEach(() => undoFill());
describe('broader form coverage', () => {
  it('fills opaque control IDs using semantic HTML autocomplete metadata', () => {
    document.body.innerHTML =
      '<input id="q1" autocomplete="section-person given-name"><input id="q2" autocomplete="family-name"><input id="q3" autocomplete="email"><input id="q4" autocomplete="address-line1"><input id="q5" autocomplete="address-level2"><select id="q6" autocomplete="country"><option value="">Choose</option><option value="IN">IND</option></select>';
    expect(fillForm(document, fields).filled).toBe(6);
    expect(
      [...document.querySelectorAll('input,select')].map((e) => (e as HTMLInputElement).value),
    ).toEqual(['Alex', 'Sharma', 'alex@example.test', '42 Example Road', 'Bengaluru', 'IN']);
  });
  it('finds labels outside single-control wrappers without borrowing neighboring questions', () => {
    document.body.innerHTML =
      '<div class="form-group"><div class="field-label">Email address</div><div><input id="q1"></div></div><div class="form-group"><div class="field-label">City</div><span><input id="q2"></span></div><form><p>Postal code</p><input id="unknown"></form>';
    expect(fillForm(document, fields).filled).toBe(2);
    expect((document.getElementById('q1') as HTMLInputElement).value).toBe('alex@example.test');
    expect((document.getElementById('unknown') as HTMLInputElement).value).toBe('');
  });
  it('supports text-only editable answers and restores them through undo', () => {
    document.body.innerHTML =
      '<div role="textbox" contenteditable="true" aria-label="Skills"></div>';
    expect(fillForm(document, fields).filled).toBe(1);
    expect(document.querySelector('div')!.textContent).toBe('Python, TypeScript');
    undoFill();
    expect(document.querySelector('div')!.textContent).toBe('');
  });
  it('does not put the applicant identity into a reference or billing/card field', () => {
    document.body.innerHTML =
      '<fieldset><legend>Emergency contact</legend><input autocomplete="given-name"><input autocomplete="email"></fieldset><input autocomplete="section-payment billing cc-number" aria-label="Phone number"><input type="search" aria-label="Search">';
    expect(fillForm(document, fields).filled).toBe(0);
    expect(scanForm(document, fields).questions).toHaveLength(2);
  });
  it('selects a button combobox through its linked option handler without submitting', async () => {
    document.body.innerHTML =
      '<form><label id="country-label">Country</label><button type="button" aria-labelledby="country-label" role="combobox" aria-controls="countries" aria-expanded="false">Select</button><div role="listbox" id="countries" hidden><div role="option">India</div></div></form>';
    const control = document.querySelector('button')!;
    const popup = document.getElementById('countries')!;
    control.addEventListener('click', () => (popup.hidden = false));
    popup.firstElementChild!.addEventListener('click', () => {
      control.textContent = 'India';
      control.setAttribute('aria-expanded', 'false');
      popup.hidden = true;
    });
    expect((await fillFormWithWidgets(document, fields)).filled).toBe(1);
    expect(control.textContent).toBe('India');
  });
  it('recognizes a job form without career words in its URL', () => {
    document.body.innerHTML =
      '<form><h1>Job application</h1><input><input><textarea></textarea></form>';
    expect(isJobContext(document)).toBe(true);
  });
  it('uses the shared question text for native radios inside ATS field wrappers', () => {
    document.body.innerHTML =
      '<div class="fb-dash-form-element"><label>Willing to relocate?</label><div><label><input type="radio" name="radio-group-:r7:" value="yes">Yes</label><label><input type="radio" name="radio-group-:r7:" value="no">No</label></div></div>';
    const answer: CustomField = {
      id: 'relocate',
      label: 'Willing to relocate',
      value: 'Yes',
      aliases: [],
      exclude: [],
      category: 'Personal',
      enabled: true,
      matchMode: 'phrase',
      scope: '',
    };
    expect(fillForm(document, [answer]).filled).toBe(1);
    expect(document.querySelector<HTMLInputElement>('input')!.checked).toBe(true);
  });
});
