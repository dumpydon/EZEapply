import { describe, expect, it } from 'vitest';
import { countryValueAliases, profileAutofillFields } from '../src/profile-fields';
import { matchField } from '../src/matcher';
import type { CustomField } from '../src/types';

const profile = {
  contactData: { email: 'alex@example.test' },
  addressData: {
    line1: '12 Example Road',
    line2: 'Suite 3',
    city: 'Example City',
    state: 'Example State',
    postalCode: '123456',
    country: 'India',
  },
  websiteData: {
    linkedin: 'https://www.linkedin.com/in/example',
    github: 'https://github.com/example',
    personal: 'https://example.test',
    websites: ['https://project.example.test'],
  },
  skillsData: ['TypeScript', 'Python', 'TypeScript'],
  jobData: [
    { company: 'Former Co', jobTitle: 'Intern', currentlyWorkHere: false },
    { company: 'Current Co', jobTitle: 'Engineer', currentlyWorkHere: true },
  ],
  educationData: [
    { school: 'Example University', degree: "Bachelor's", fieldOfStudy: 'Computer Science' },
  ],
};
const fields = () => profileAutofillFields(profile);
const match = (label: string, collection = fields()) =>
  matchField([label], collection, 'careers.example.test').field;
type WithMetadata = CustomField & { autocomplete?: string[]; valueAliases?: string[] };

describe('saved profile fallback fields', () => {
  it('fills explicit contact, address, links and skills from saved values', () => {
    const cases: [string, string][] = [
      ['Email address', 'alex@example.test'],
      ['Street address', '12 Example Road'],
      ['Address line 2', 'Suite 3'],
      ['Current city', 'Example City'],
      ['State or province', 'Example State'],
      ['ZIP / Postal code', '123456'],
      ['Country of residence', 'India'],
      ['LinkedIn profile URL', 'https://www.linkedin.com/in/example'],
      ['GitHub', 'https://github.com/example'],
      ['Portfolio URL', 'https://example.test'],
      ['Technical skills', 'TypeScript, Python'],
    ];
    for (const [question, answer] of cases) expect(match(question)?.value, question).toBe(answer);
  });
  it('provides semantic autocomplete tokens without overwriting stored spelling', () => {
    const all = fields() as WithMetadata[];
    expect(all.find((field) => field.id === 'profile:email')?.autocomplete).toEqual(['email']);
    expect(all.find((field) => field.id === 'profile:street-address')).toMatchObject({
      value: '12 Example Road\nSuite 3',
      autocomplete: ['street-address'],
    });
    expect(all.find((field) => field.id === 'profile:country')).toMatchObject({
      value: 'India',
      autocomplete: ['country', 'country-name'],
      valueAliases: ['India', 'IN'],
    });
  });
  it('does not confuse other people, employers, eligibility, phone code or birthplace with personal details', () => {
    for (const label of [
      'Referrer email',
      'Emergency contact email',
      'Company website',
      'Previous employer address',
      'University city',
      'Country of birth',
      'Country of citizenship',
      'Phone country code',
      'Are you authorized to work in this country?',
      'State your salary expectations',
    ]) {
      expect(match(label), label).toBeUndefined();
    }
  });
  it('fills current employment only if exactly one current job is identified', () => {
    expect(match('Current employer')?.value).toBe('Current Co');
    expect(match('Current job title')?.value).toBe('Engineer');
    expect(match('Company')).toBeUndefined();
    expect(match('Job title')).toBeUndefined();
    const ambiguous = profileAutofillFields({
      ...profile,
      jobData: profile.jobData.map((job) => ({ ...job, currentlyWorkHere: true })),
    });
    expect(match('Current employer', ambiguous)).toBeUndefined();
  });
  it('avoids guessing education records or using one record for every repeated question', () => {
    expect(match('Most recent school')?.value).toBe('Example University');
    for (const label of [
      'School',
      'University',
      'Degree',
      'Start date',
      'Graduation date',
      'Highest degree',
    ])
      expect(match(label), label).toBeUndefined();
    const multiple = profileAutofillFields({
      ...profile,
      educationData: [...profile.educationData, { school: 'Second University' }],
    });
    expect(match('Most recent school', multiple)).toBeUndefined();
  });
  it('keeps missing or malformed data empty and never derives eligibility, demographics or compensation', () => {
    expect(profileAutofillFields({})).toEqual([]);
    expect(
      profileAutofillFields({
        contactData: [],
        addressData: null,
        websiteData: { personal: 42 },
        skillsData: [' ', false],
        jobData: 'Engineer',
      }),
    ).toEqual([]);
    const explicit = profileAutofillFields({
      ...profile,
      employmentData: { eligibilityUS: true, sponsorship: true, gender: 'Male', age: 30 },
    });
    for (const label of [
      'Work authorization',
      'Authorized to work in India',
      'Gender',
      'Age',
      'Expected salary',
      'Years of experience',
    ])
      expect(match(label, explicit), label).toBeUndefined();
  });
  it('does not select an arbitrary project URL as the personal portfolio', () => {
    expect(
      profileAutofillFields({ websiteData: { websites: ['https://project.example.test'] } }),
    ).toEqual([]);
  });
  it('does not mutate profile data', () => {
    const copy = structuredClone(profile);
    profileAutofillFields(copy);
    expect(copy).toEqual(profile);
  });
});

describe('country option aliases', () => {
  it('recognizes official saved country names and ISO option values', () => {
    expect(countryValueAliases('United States of America')).toContain('US');
    expect(countryValueAliases('USA')).toContain('United States');
    expect(countryValueAliases('United Kingdom')).toContain('GB');
    expect(countryValueAliases('UK')).toContain('United Kingdom');
    expect(countryValueAliases('Türkiye')).toContain('TR');
  });
  it('does not invent aliases for an unknown country', () => {
    expect(countryValueAliases('Example country')).toEqual(['Example country']);
    expect(countryValueAliases('')).toEqual([]);
  });
});
