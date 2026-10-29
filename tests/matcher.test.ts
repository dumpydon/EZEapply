import { describe, expect, it } from 'vitest';
import { includesPhrase, matchField, matchesScope, normalize } from '../src/matcher';
import type { CustomField } from '../src/types';

const field = (
  id: string,
  label: string,
  value: string,
  aliases: string[] = [],
  extra: Partial<CustomField> = {},
): CustomField => ({
  id,
  label,
  value,
  aliases,
  category: 'Personal questions',
  enabled: true,
  matchMode: 'phrase',
  exclude: [],
  scope: '',
  ...extra,
});

describe('custom answer matching', () => {
  it('normalizes required labels, punctuation and machine names', () => {
    expect(normalize('firstName (required) *')).toBe('first name');
    expect(normalize(' Expected CTC (₹ / year): ')).toBe('expected ctc year');
    expect(normalize('EXPECTED_COMPENSATION')).toBe('expected compensation');
  });
  it('matches whole phrases without substring accidents', () => {
    expect(includesPhrase('first name', 'name')).toBe(true);
    expect(includesPhrase('username', 'name')).toBe(false);
    expect(
      matchField(['Email address'], [field('1', 'Mail', 'test')], 'example.com').field,
    ).toBeUndefined();
  });
  it('matches question wording through explicit aliases', () => {
    const expected = field('expected', 'Expected compensation', '1200000', [
      'expected ctc',
      'salary expectations',
    ]);
    expect(
      matchField(['What are your salary expectations?'], [expected], 'jobs.example.com').field?.id,
    ).toBe('expected');
  });
  it('does not confuse current and expected salary when a broad alias exists', () => {
    const expected = field('expected', 'Expected compensation', '1200000', ['compensation']);
    const current = field('current', 'Current compensation', '900000', ['compensation']);
    expect(matchField(['Current compensation'], [expected, current], '').field?.id).toBe('current');
    expect(
      matchField(['What is your present compensation?'], [expected], '').field,
    ).toBeUndefined();
    expect(matchField(['Compensation'], [expected, current], '').reason).toMatch('Multiple');
  });
  it('disambiguates first, middle and last name', () => {
    const first = field('first', 'First name', 'Alex', ['name']);
    const last = field('last', 'Last name', 'Chen', ['name']);
    const middle = field('middle', 'Middle name', 'M', ['name']);
    expect(matchField(['Family name'], [first, last, middle], '').field?.id).toBe('last');
    expect(matchField(['Middle name'], [first, last, middle], '').field?.id).toBe('middle');
  });
  it('chooses explicit phone format over a generic alias', () => {
    const international = field('intl', 'Phone international', '+919876543210', ['phone']);
    const national = field('national', 'Phone number only', '9876543210', [
      'phone without country code',
    ]);
    expect(
      matchField(['Phone without country code'], [international, national], '').field?.id,
    ).toBe('national');
    expect(
      matchField(['Phone including country code'], [international, national], '').field?.id,
    ).toBe('intl');
  });
  it('skips equally plausible different answers', () => {
    expect(
      matchField(
        ['Notice period'],
        [field('a', 'Notice period', '30'), field('b', 'Notice period', '60')],
        '',
      ).field,
    ).toBeUndefined();
  });
  it('does not treat duplicate equal values as a conflict', () => {
    expect(
      matchField(
        ['Notice period'],
        [field('a', 'Notice period', '30'), field('b', 'Notice period', '30')],
        '',
      ).field?.id,
    ).toBe('a');
  });
  it('applies enabled, empty, exact, excluded and hostname rules', () => {
    const rule = field('1', 'Notice period', '30 days', [], {
      scope: 'example.com',
      exclude: ['maximum'],
    });
    expect(matchField(['Notice period'], [rule], 'jobs.example.com').field).toBeDefined();
    expect(matchField(['Notice period'], [rule], 'notexample.com').field).toBeUndefined();
    expect(matchField(['Maximum notice period'], [rule], 'example.com').field).toBeUndefined();
    expect(
      matchField(['Notice period'], [{ ...rule, enabled: false }], 'example.com').field,
    ).toBeUndefined();
    expect(
      matchField(['Notice period'], [{ ...rule, value: ' ' }], 'example.com').field,
    ).toBeUndefined();
    expect(
      matchField(['Your notice period'], [{ ...rule, matchMode: 'exact' }], 'example.com').field,
    ).toBeUndefined();
    expect(matchesScope('example.com', 'example.com.evil.test')).toBe(false);
  });
  it('prefers an exact visible label to a generic field name', () => {
    const current = field('a', 'Current compensation', '10', ['salary']);
    const expected = field('b', 'Expected compensation', '20', ['salary']);
    expect(matchField(['Expected compensation', 'salary'], [current, expected], '').field?.id).toBe(
      'b',
    );
  });
  it('matches core keywords across polite wording, punctuation, case and word order', () => {
    const expected = field('expected', 'Please enter your expected CTC', '8');
    for (const question of [
      "What's your expected CTC?",
      'EXPECTED ctc *',
      'CTC expected',
      'What is your expected C.T.C.?',
      'Your expected cost to company',
    ]) {
      expect(matchField([question], [expected], '').field?.value, question).toBe('8');
    }
    expect(
      matchField(
        ["What's your notice period?"],
        [field('notice', 'Please enter your notice period in days', '10')],
        '',
      ).field?.value,
    ).toBe('10');
  });
  it('selects generic, INR and lakh answers independently without converting their values', () => {
    const fields = [
      field('generic', 'Your expected CTC', '8'),
      field('inr', 'Please enter your expected CTC in INR', '800000', ['expected ctc']),
      field('lakh', 'Expected CTC in lakhs', '8.5'),
      field('current', 'Please enter your current CTC in INR', '600000'),
    ];
    for (const question of ["What's your expected CTC?", 'Your expected CTC']) {
      expect(matchField([question], fields, '').field?.id, question).toBe('generic');
    }
    for (const question of [
      'Expected CTC in INR',
      'What is your expected CTC in INR?',
      'Please enter your expected CTC in rupees',
      'Expected CTC (₹)',
    ]) {
      expect(matchField([question], fields, '').field?.value, question).toBe('800000');
    }
    expect(matchField(['What is your expected CTC in LPA?'], fields, '').field?.value).toBe('8.5');
    expect(matchField(['What is your current CTC in INR?'], fields, '').field?.id).toBe('current');
    expect(matchField(['Expected CTC in USD'], fields, '').field).toBeUndefined();
    expect(matchField(['Expected CTC in crores'], fields, '').field).toBeUndefined();
  });
  it('does not guess a generic amount from an INR-only answer or a lower-priority machine name', () => {
    const inr = field('inr', 'Please enter your expected CTC in INR', '800000', ['expected ctc']);
    const result = matchField(["What's your expected CTC?", 'expected_ctc_in_inr'], [inr], '');
    expect(result.field).toBeUndefined();
    expect(result.reason).toContain('different units');
    const generic = field('generic', 'Expected CTC', '8');
    expect(
      matchField(["What's your expected CTC?", 'expected_ctc_in_inr'], [inr, generic], '').field
        ?.id,
    ).toBe('generic');
  });
  it('allows a deliberate unit alias on a generic answer but rejects contradictory aliases', () => {
    const generic = field('generic', 'Expected CTC', '8', ['Expected CTC in lakhs']);
    expect(matchField(['Please enter your expected CTC in LPA'], [generic], '').field?.value).toBe(
      '8',
    );
    const inr = field('inr', 'Expected CTC in INR', '800000', ['Expected CTC in lakhs']);
    expect(matchField(['Expected CTC in lakhs'], [inr], '').field).toBeUndefined();
  });
  it('keeps exact rules strict and asks for clarification when keyword answers conflict', () => {
    const exact = field('exact', 'Please enter your expected CTC', '8', [], { matchMode: 'exact' });
    expect(matchField(["What's your expected CTC?"], [exact], '').field).toBeUndefined();
    const fields = [
      field('a', 'Please enter your expected CTC', '8'),
      field('b', 'Please provide your expected CTC', '9'),
    ];
    expect(matchField(["What's your expected CTC?"], fields, '').reason).toContain('Multiple');
    expect(
      matchField(
        ['Notice period in months'],
        [field('days', 'Notice period in days', '10', ['notice period'])],
        '',
      ).field,
    ).toBeUndefined();
  });
  it('uses saved lakh CTC variants for annual questions without amount units', () => {
    const fields = [
      field('current-lakh', 'What is your Current CTC? (In Lacs)', '9'),
      field('expected-lakh', 'What is your Expected CTC? [In Lakhs]', '11'),
      field('current-inr', 'Please enter your current CTC in INR', '800000'),
      field('expected-inr', 'Please enter your expected CTC in INR', '1100000'),
    ];
    expect(
      matchField(
        ['What is your current CTC per annum (including any variable components)?'],
        fields,
        '',
      ).field?.id,
    ).toBe('current-lakh');
    for (const question of [
      'What is your expected CTC per annum?',
      'Your desired annual CTC',
      'Expected CTC (LPA)',
      'Expected CTC in lacs',
    ]) {
      expect(matchField([question], fields, '').field?.id, question).toBe('expected-lakh');
    }
    expect(matchField(['What is your expected CTC per annum in INR?'], fields, '').field?.id).toBe(
      'expected-inr',
    );
    expect(matchField(['What is your expected CTC in INR lakhs?'], fields, '').field?.id).toBe(
      'expected-lakh',
    );
    const generic = field('default', 'Expected CTC', '8');
    expect(
      matchField(['What is your expected CTC per annum?'], [...fields, generic], '').field?.id,
    ).toBe('default');
  });
  it('keeps monthly amounts, components and percentage questions separate from total annual CTC', () => {
    const total = field('total', 'Current CTC (in lacs)', '9', ['current ctc']);
    for (const question of [
      'Current CTC per month',
      'Current CTC variable component only',
      'Current CTC fixed component',
      'Percentage increase in current CTC',
      'Describe your current CTC',
      'Is your current CTC negotiable?',
    ]) {
      expect(matchField([question], [total], '').field, question).toBeUndefined();
    }
  });
  it('matches an expanded notice-period question without confusing it with a date or yes/no question', () => {
    const notice = field('notice', 'Please enter your notice period in days', '10', [
      'notice period',
    ]);
    expect(
      matchField(
        [
          'What is your notice period? If you are on notice already, when are you available to join?',
        ],
        [notice],
        '',
      ).field?.id,
    ).toBe('notice');
    expect(matchField(['How long is your notice period?'], [notice], '').field?.id).toBe('notice');
    expect(
      matchField(['Are you currently serving your notice period?'], [notice], '').field,
    ).toBeUndefined();
    expect(
      matchField(['What is your joining date after the notice period?'], [notice], '').field,
    ).toBeUndefined();
  });
  it.each([
    'What is your Notice period?',
    'What is your current notice period?',
    'Please share your contractual notice duration (days)',
    'If offered the role, within how many days will you be able to join?*',
    'How many days do you need to join us?',
    'In how many days can you start work?',
    'How soon could you join?',
    'Joining availability (in days)',
    'Number of days required to join',
  ])('matches the notice duration concept: %s', (question) => {
    expect(matchField([question], [field('notice', 'Notice Period', '7')], '').field?.value).toBe(
      '7',
    );
    expect(
      matchField(['Notice period in days'], [field('joining', question, '7')], '').field?.value,
    ).toBe('7');
  });
  it('keeps joining dates, yes/no commitments, unrelated durations and notice units distinct', () => {
    const notice = field('notice', 'Notice period', '7');
    for (const question of [
      'When can you join?',
      'What is your joining date?',
      'Can you join within 7 days?',
      'Are you serving your notice period?',
      'Is your notice period negotiable?',
      'Notice period buyout amount',
      'How many days of training do you need before joining?',
      'How many working days before you can join?',
      'Notice period in weeks',
    ]) {
      expect(matchField([question], [notice], '').field, question).toBeUndefined();
    }
    const month = field('months', 'Notice period', '1 month');
    expect(matchField(['Notice period in months'], [month], '').field?.value).toBe('1 month');
    expect(matchField(['How many days will you need to join?'], [month], '').field).toBeUndefined();
    expect(
      matchField(['How soon can you join?'], [notice, { ...notice, id: 'other', value: '14' }], '')
        .reason,
    ).toContain('Multiple');
    expect(
      matchField(['How soon can you join?'], [{ ...notice, matchMode: 'exact' }], '').field,
    ).toBeUndefined();
  });
  it.each(['current', 'expected'])(
    'uses a generic %s CTC as the lakh fallback without mixing pay components',
    (qualifier) => {
      const generic = field('generic', `${qualifier} CTC`, '9');
      for (const question of [
        `What is your ${qualifier} CTC salary in Lakh Per Annum?*`,
        `${qualifier} CTC in lakhs`,
        `Please share your ${qualifier} C.T.C. compensation (INR lakhs / year)`,
        `${qualifier} cost to company in LPA`,
      ]) {
        expect(matchField([question], [generic], '').field?.value, question).toBe('9');
      }
      for (const question of [
        `${qualifier} CTC in INR`,
        `${qualifier} CTC in USD`,
        `${qualifier} CTC in crores`,
        `${qualifier} CTC in lakhs per month`,
        `${qualifier} fixed CTC in lakhs`,
        `${qualifier} variable CTC in LPA`,
      ]) {
        expect(matchField([question], [generic], '').field, question).toBeUndefined();
      }
      const lakh = field('lakh', `${qualifier} CTC (in lacs)`, '10');
      expect(
        matchField([`What is your ${qualifier} CTC salary in Lakh Per Annum?`], [generic, lakh], '')
          .field?.id,
      ).toBe('lakh');
      const opposite = field(
        'opposite',
        `${qualifier === 'current' ? 'expected' : 'current'} CTC`,
        '11',
      );
      expect(matchField([`${qualifier} CTC in LPA`], [opposite], '').field).toBeUndefined();
    },
  );
  it('matches fixed-salary wording only to a saved fixed-salary answer', () => {
    const question = 'What is your expectation for fixed salary? (annually)*';
    expect(matchField([question], [field('total', 'Expected CTC', '9')], '').field).toBeUndefined();
    expect(
      matchField([question], [field('fixed', 'Expected fixed salary (annual)', '8')], '').field
        ?.value,
    ).toBe('8');
  });
  it('understands experience-duration paraphrases and preserves skills, scope and units', () => {
    const fields = [
      field('total', 'Please select your total years of professional experience', '2'),
      field('python', 'Years of experience in Python', '1'),
      field('js', 'JavaScript experience in years', '0.5'),
      field('months', 'Please select your total additional months of experience', '3'),
      field('relevant', 'Relevant experience in years', '1.5'),
    ];
    for (const question of [
      'What is your experience?',
      'How many years have you worked in these fields?',
      'How many years of work experience do you have?',
      'Total professional experience (years)',
    ]) {
      expect(matchField([question], fields, '').field?.id, question).toBe('total');
    }
    expect(
      matchField(['How many years have you been working with Python?'], fields, '').field?.id,
    ).toBe('python');
    expect(
      matchField(['How many years have you worked with JavaScript?'], fields, '').field?.id,
    ).toBe('js');
    expect(matchField(['Additional months of experience'], fields, '').field?.id).toBe('months');
    expect(
      matchField(['How many years of relevant experience do you have?'], fields, '').field?.id,
    ).toBe('relevant');
    expect(matchField(['Python experience in months'], fields, '').field).toBeUndefined();
    expect(matchField(['Do you have experience with Python?'], fields, '').field).toBeUndefined();
    expect(matchField(['Describe your experience with Python'], fields, '').field).toBeUndefined();
  });
  it('does not let broad experience aliases erase a named skill or conflate C, C++ and C#', () => {
    const cpp = field('cpp', 'C++ experience in years', '2', ['experience']);
    expect(matchField(['How many years have you worked with C++?'], [cpp], '').field?.id).toBe(
      'cpp',
    );
    for (const question of [
      'Years of experience in C',
      'Years of experience in C#',
      'Total years of experience',
      'Experience in Java',
    ]) {
      expect(matchField([question], [cpp], '').field, question).toBeUndefined();
    }
    const total = field('total', 'Total experience in years', '4', ['experience']);
    expect(
      matchField(['Python experience (years)', 'totalExperience'], [total], '').field,
    ).toBeUndefined();
    const duplicate = { ...total, id: 'other', value: '5' };
    expect(
      matchField(['How many years have you worked?'], [total, duplicate], '').reason,
    ).toContain('Multiple');
  });
  it.each([
    'College or Institution name *',
    'University name',
    'Name of your college',
    'Please enter your educational institution name',
    'School name',
    'Name of your institute',
  ])('matches the saved school/college-name concept: %s', (question) => {
    const saved = field('school', 'School or college name', 'Example University');
    expect(matchField([question], [saved], '').field?.value).toBe('Example University');
    expect(
      matchField(
        ['College or institution name'],
        [field('other', question, 'Example University')],
        '',
      ).field?.value,
    ).toBe('Example University');
  });
  it('preserves school levels and does not use an institution name for addresses or combined questions', () => {
    const saved = field('school', 'School or college name', 'Example University', [
      'institution name',
    ]);
    for (const question of [
      'High school name',
      'School name and graduation year',
      'University name and address',
      'Referee institution name',
    ]) {
      expect(matchField([question], [saved], '').field, question).toBeUndefined();
    }
    expect(
      matchField(
        ['College or institution name'],
        [saved, { ...saved, id: 'other', value: 'Other University' }],
        '',
      ).reason,
    ).toContain('Multiple');
    expect(
      matchField(['University name'], [{ ...saved, matchMode: 'exact' }], '').field,
    ).toBeUndefined();
  });
});

describe('derived profile fields integration', () => {
  it('matches national/international phone formats and keeps dial code separate', async () => {
    const { builtInFields } = await import('../src/storage');
    const fields = builtInFields({
      id: 'local',
      name: 'Test profile',
      personal: {
        firstName: 'Alex',
        lastName: 'Chen',
        phoneNumber: '9876543210',
        phoneCountryCode: '91',
      },
    });
    expect(matchField(['Phone number'], fields, '').field?.value).toBe('9876543210');
    expect(matchField(['Phone without country code'], fields, '').field?.value).toBe('9876543210');
    expect(matchField(['Phone including country code'], fields, '').field?.value).toBe(
      '+919876543210',
    );
    expect(matchField(['Phone country code'], fields, '').field?.value).toBe('+91');
    expect(matchField(['Emergency contact number'], fields, '').field).toBeUndefined();
    expect(matchField(['Alternate phone number'], fields, '').field).toBeUndefined();
  });
  it('does not fill a full name into an individual name question', async () => {
    const { builtInFields } = await import('../src/storage');
    const fields = builtInFields({
      id: 'local',
      name: 'Test profile',
      personal: {
        firstName: 'Alex',
        middleName: 'M',
        lastName: 'Chen',
      },
    });
    expect(matchField(['Full legal name'], fields, '').field?.value).toBe('Alex M Chen');
    expect(matchField(['Middle name'], fields, '').field?.value).toBe('M');
    expect(matchField(['Surname'], fields, '').field?.value).toBe('Chen');
  });
});
