// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAutofillData } from '../src/storage';
import { fillFormWithWidgets, undoFill } from '../src/content';
import { attachResume } from '../src/resume';
import type { CustomField } from '../src/types';

afterEach(() => {
  undoFill();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('independent compatibility fixture', () => {
  it('passes the complete fixture through the same storage/matching/DOM modules', async () => {
    const html = await readFile('fixtures/compatibility-form.html', 'utf8');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.head.innerHTML = parsed.head.innerHTML;
    document.body.innerHTML = parsed.body.innerHTML;
    document.body.setAttribute('data-compatibility-form', '');
    const fixture = await readFile('fixtures/compatibility.js', 'utf8');
    // Our own fixture script supplies independent application-state checks.
    new Function(fixture)();
    const frame = document.querySelector<HTMLIFrameElement>('#embedded-application')!;
    frame.src = 'about:blank';
    const frameHtml = await readFile('fixtures/compatibility-frame.html', 'utf8');
    frame.contentDocument!.body.innerHTML = new DOMParser().parseFromString(
      frameHtml,
      'text/html',
    ).body.innerHTML;
    const custom: CustomField[] = [
      {
        id: 'expected',
        label: 'Expected compensation',
        value: '1200000',
        aliases: ['expected salary'],
        exclude: ['current'],
        enabled: true,
        category: 'Personal',
        scope: '',
        matchMode: 'phrase',
      },
      {
        id: 'notice',
        label: 'Notice period',
        value: '30 days',
        aliases: [],
        exclude: [],
        enabled: true,
        category: 'Personal',
        scope: '',
        matchMode: 'phrase',
      },
    ];
    const profile = {
      nameData: { firstName: 'Alex', lastName: 'Sharma' },
      contactData: { phoneNumber: '+919000000000', email: 'alex@example.test' },
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
      skillsData: ['TypeScript', 'Python'],
      resumeData: {
        fileName: 'Alex-example-resume.pdf',
        resumeBase64: btoa('%PDF-1.4\nSynthetic example.'),
      },
    };
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async () => ({
            profile,
            'eze.customFields.v1': {
              version: 1,
              profiles: { local: { autoFill: true, fields: custom } },
            },
          }),
        },
      },
    });
    const data = await getAutofillData();
    await fillFormWithWidgets(document, data.fields);
    await fillFormWithWidgets(frame.contentDocument!, data.fields);
    const input = document.querySelector<HTMLInputElement>('#resume-upload')!;
    const fileList: File[] = [];
    const inputDescriptor = Object.getOwnPropertyDescriptor(input, 'files');
    Object.defineProperty(input, 'files', {
      configurable: true,
      get: () => fileList,
      set: (files: File[]) => fileList.splice(0, fileList.length, ...files),
    });
    class Transfer {
      files: File[] = [];
      items = { add: (file: File) => this.files.push(file) };
    }
    vi.stubGlobal('DataTransfer', Transfer);
    await attachResume(document, data.resume!);
    document.querySelector<HTMLButtonElement>('#reveal-step')!.click();
    await fillFormWithWidgets(document, data.fields);
    document.querySelector<HTMLButtonElement>('#check-results')!.click();
    const failures = [...document.querySelectorAll('.checks .fail,.checks .pending')].map(
      (node) => node.textContent,
    );
    expect(failures).toEqual([]);
    expect(document.querySelector('#result-summary')!.textContent).toBe(
      '27 / 27 fixture checks passed',
    );
    if (inputDescriptor) Object.defineProperty(input, 'files', inputDescriptor);
  });
});
