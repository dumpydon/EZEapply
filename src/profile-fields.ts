import { getCountries } from 'libphonenumber-js/min';
import type { CustomField } from './types';

type ProfileField = CustomField & { autocomplete?: string[]; valueAliases?: string[] };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function items(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}
function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

// Exact option equivalents, never substring guesses. Preserve the stored
// spelling as the submitted text; these aliases only help select known options.
const COUNTRY_EQUIVALENTS: Record<string, string[]> = {
  US: ['United States', 'United States of America', 'USA', 'U.S.', 'U.S.A.'],
  GB: ['United Kingdom', 'Great Britain', 'UK', 'U.K.'],
  KR: ['South Korea', 'Korea, Republic of', 'Republic of Korea'],
  KP: ['North Korea', "Korea, Democratic People's Republic of"],
  RU: ['Russia', 'Russian Federation'],
  TW: ['Taiwan', 'Taiwan, Province of China'],
  VN: ['Vietnam', 'Viet Nam'],
  TZ: ['Tanzania', 'Tanzania, United Republic of'],
  BO: ['Bolivia', 'Bolivia, Plurinational State of'],
  IR: ['Iran', 'Iran, Islamic Republic of'],
  VE: ['Venezuela', 'Venezuela, Bolivarian Republic of'],
  MD: ['Moldova', 'Moldova, Republic of'],
  SY: ['Syria', 'Syrian Arab Republic'],
  LA: ['Laos', "Lao People's Democratic Republic"],
  TR: ['Turkey', 'Türkiye'],
  CZ: ['Czechia', 'Czech Republic'],
  CI: ['Ivory Coast', 'Côte d’Ivoire', "Côte d'Ivoire"],
};

const countryKey = (value: string): string =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[.,’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function countryValueAliases(value: string): string[] {
  const key = countryKey(value);
  if (!key) return [];
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const code = getCountries().find((code) =>
    [code, names.of(code) || '', ...(COUNTRY_EQUIVALENTS[code] || [])].some(
      (alias) => countryKey(alias) === key,
    ),
  );
  return code
    ? unique([value, code, names.of(code) || '', ...(COUNTRY_EQUIVALENTS[code] || [])])
    : [value];
}

const OTHER_PERSON = [
  'referrer',
  'referral',
  'referred by',
  'reference',
  'recruiter',
  'emergency',
  'manager',
  'supervisor',
  'parent',
  'guardian',
];
const OTHER_ADDRESS = [
  ...OTHER_PERSON,
  'company',
  'employer',
  'office',
  'school',
  'university',
  'institution',
  'billing',
  'shipping',
  'previous',
  'former',
  'preferred',
  'desired',
  'job location',
];

/** Additional autofill-only fields from explicit saved profile values.
 * This is intentionally separate from sidebar shortcuts: it neither adds rows
 * to the library nor invents missing answers from a resume or biography. */
export function profileAutofillFields(profile: Record<string, unknown>): CustomField[] {
  const contact = record(profile.contactData);
  const address = record(profile.addressData);
  const websites = record(profile.websiteData);
  const result: ProfileField[] = [];
  const add = (
    id: string,
    label: string,
    value: string,
    aliases: string[],
    exclude: string[] = [],
    autocomplete: string[] = [],
    valueAliases: string[] = [],
  ): void => {
    if (!value) return;
    result.push({
      id: `profile:${id}`,
      label,
      value,
      aliases: unique(aliases),
      exclude: unique(exclude),
      category: 'Saved profile',
      enabled: true,
      matchMode: 'phrase',
      scope: '',
      ...(autocomplete.length ? { autocomplete } : {}),
      ...(valueAliases.length ? { valueAliases: unique(valueAliases) } : {}),
    });
  };

  add(
    'email',
    'Email',
    text(contact.email),
    [
      'email address',
      'e-mail',
      'e-mail address',
      'electronic mail',
      'contact email',
      'confirm email',
      'email confirmation',
    ],
    [...OTHER_PERSON, 'company', 'employer', 'work email', 'business email'],
    ['email'],
  );
  add(
    'address-line1',
    'Address line 1',
    text(address.line1),
    [
      'address 1',
      'address1',
      'addressline1',
      'street address',
      'address street',
      'street',
      'home address',
      'residential address',
      'address',
    ],
    [
      ...OTHER_ADDRESS,
      'email',
      'e mail',
      'web',
      'linkedin',
      'github',
      'line 2',
      'line2',
      'address 2',
      'address2',
      'apartment',
      'suite',
      'unit',
      'full address',
      'complete address',
    ],
    ['address-line1'],
  );
  add(
    'address-line2',
    'Address line 2',
    text(address.line2),
    [
      'address 2',
      'address2',
      'addressline2',
      'apartment',
      'suite',
      'unit number',
      'apt suite',
      'apt',
    ],
    OTHER_ADDRESS,
    ['address-line2'],
  );
  const street = [text(address.line1), text(address.line2)].filter(Boolean).join('\n');
  // The HTML street-address token includes street lines, not city/state/postcode.
  add(
    'street-address',
    'Complete street address',
    street,
    ['street mailing address'],
    [...OTHER_ADDRESS, 'email', 'e mail'],
    ['street-address'],
  );
  const fullAddress = [
    text(address.line1),
    text(address.line2),
    text(address.city),
    text(address.state),
    text(address.postalCode),
    text(address.country),
  ]
    .filter(Boolean)
    .join(', ');
  add(
    'full-address',
    'Full address',
    fullAddress,
    ['complete address', 'full mailing address', 'complete mailing address'],
    [...OTHER_ADDRESS, 'email', 'e mail'],
  );
  add(
    'city',
    'City',
    text(address.city),
    ['city of residence', 'current city', 'town', 'city town', 'residential city'],
    [...OTHER_ADDRESS, 'birth', 'born'],
    ['address-level2'],
  );
  add(
    'state',
    'State',
    text(address.state),
    ['province', 'state province', 'state or province', 'region of residence'],
    [
      ...OTHER_ADDRESS,
      'birth',
      'born',
      'state your',
      'state whether',
      'state why',
      'state how',
      'state the',
    ],
    ['address-level1'],
  );
  add(
    'postal-code',
    'Postal code',
    text(address.postalCode),
    ['postcode', 'post code', 'zip', 'zip code', 'zip postal code', 'pin code', 'pincode'],
    OTHER_ADDRESS,
    ['postal-code'],
  );
  add(
    'country',
    'Country',
    text(address.country),
    [
      'country region',
      'country of residence',
      'residence country',
      'residential country',
      'current country',
    ],
    [
      ...OTHER_ADDRESS,
      'citizenship',
      'nationality',
      'birth',
      'born',
      'country code',
      'calling code',
      'dial code',
      'work authorization',
      'authorized',
      'eligible',
      'sponsorship',
    ],
    ['country', 'country-name'],
    countryValueAliases(text(address.country)),
  );

  add(
    'linkedin',
    'LinkedIn',
    text(websites.linkedin),
    ['linkedin url', 'linkedin profile', 'linkedin link', 'linkedin profile url'],
    OTHER_PERSON,
  );
  add(
    'github',
    'GitHub',
    text(websites.github),
    ['github url', 'github profile', 'github link', 'github profile url'],
    OTHER_PERSON,
  );
  add(
    'website',
    'Personal website',
    text(websites.personal),
    [
      'portfolio',
      'portfolio url',
      'portfolio link',
      'personal site',
      'personal website url',
      'website',
      'website url',
      'website link',
    ],
    [
      ...OTHER_PERSON,
      'company',
      'employer',
      'linkedin',
      'github',
      'twitter',
      'facebook',
      'source',
      'how did you hear',
    ],
    ['url'],
  );
  const skills = Array.isArray(profile.skillsData)
    ? unique(
        profile.skillsData
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim()),
      )
    : [];
  add(
    'skills',
    'Skills',
    skills.join(', '),
    ['technical skills', 'relevant skills', 'skill set', 'skills list'],
    ['years', 'experience in', 'proficiency', 'rating', 'level', 'required', 'preferred'],
  );

  // Multiple current roles are legitimate. Do not silently choose one.
  const currentJobs = items(profile.jobData).filter((job) => job.currentlyWorkHere === true);
  if (currentJobs.length === 1) {
    const current = currentJobs[0];
    add(
      'current-company',
      'Current company',
      text(current.company),
      ['current employer', 'present employer', 'present company', 'current organization'],
      [...OTHER_PERSON, 'previous', 'former', 'expected', 'desired'],
    );
    add(
      'current-title',
      'Current job title',
      text(current.jobTitle),
      [
        'current title',
        'current position',
        'current role',
        'present job title',
        'current designation',
      ],
      [...OTHER_PERSON, 'previous', 'former', 'expected', 'desired', 'applying'],
    );
  }

  // A single education record can answer explicitly qualified summary questions.
  // Repeating School/Degree/Start date sections require record-aware handling.
  const education = items(profile.educationData);
  if (education.length === 1) {
    const entry = education[0];
    add(
      'recent-school',
      'Most recent school',
      text(entry.school),
      [
        'most recent university',
        'most recent institution',
        'most recent college',
        'last attended school',
        'last attended university',
        'last attended college',
      ],
      [...OTHER_PERSON, 'high school', 'secondary school'],
    );
    add(
      'recent-degree',
      'Most recent degree',
      text(entry.degree),
      ['degree from most recent institution'],
      [...OTHER_PERSON, 'high school'],
    );
    add(
      'recent-major',
      'Most recent field of study',
      text(entry.fieldOfStudy),
      ['major from most recent institution'],
      OTHER_PERSON,
    );
  }
  return result;
}
