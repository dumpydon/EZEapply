import { describe, it, expect, vi } from 'vitest';
import {
  builtInFields,
  getActiveFields,
  getAutofillData,
  getAutoFillPreference,
  getCustomProfile,
  parseImport,
  saveCustomProfile,
  validateProfile,
  phoneVariants,
} from '../src/storage';
import { STORAGE_KEY } from '../src/types';
import type { CustomField } from '../src/types';

const field: CustomField = {
  id: 'expected',
  label: 'Expected compensation',
  value: '1200000',
  aliases: ['expected salary', 'expected ctc'],
  exclude: ['current', 'previous'],
  category: 'Compensation',
  enabled: true,
  matchMode: 'phrase',
  scope: '',
};
describe('custom-field storage validation', () => {
  it('honors the master autofill switch without hiding answers from manual Fill', async () => {
    const data: Record<string, unknown> = {
      autofillEnabled: false,
      profile: { nameData: { firstName: 'Alex' } },
      [STORAGE_KEY]: { version: 1, profiles: { local: { fields: [field], autoFill: true } } },
    };
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async (keys: string[]) => Object.fromEntries(keys.map((key) => [key, data[key]])),
        },
      },
    });
    try {
      const settings = await getAutofillData();
      expect(settings.autoFill).toBe(false);
      expect(settings.fields.find((value) => value.id === field.id)?.value).toBe(field.value);
      data.autofillEnabled = true;
      expect((await getAutofillData()).autoFill).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('uses edited profile shortcuts for both sidebar and autofill, retains semantic tokens, and round-trips them in exports', async () => {
    const override = {
      ...field,
      id: 'builtin:first',
      label: 'First name',
      value: 'Alexander',
      aliases: ['given name'],
      exclude: [],
    };
    const saved = { fields: [field], autoFill: true, profileOverrides: [override] };
    expect(parseImport(JSON.stringify(saved))).toEqual(saved);
    const data = {
      profile: { nameData: { firstName: 'Alex', lastName: 'Doe' } },
      [STORAGE_KEY]: { version: 1, profiles: { local: saved } },
    };
    vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => data) } } });
    try {
      expect((await getActiveFields()).fields.find((f) => f.id === 'builtin:first')?.value).toBe(
        'Alexander',
      );
      expect((await getAutofillData()).fields.find((f) => f.id === 'builtin:first')).toMatchObject({
        value: 'Alexander',
        autocomplete: ['given-name'],
      });
      expect((await getAutofillData()).fields.find((f) => f.id === 'builtin:full')?.value).toBe(
        'Alex Doe',
      );
      expect(data.profile.nameData.firstName).toBe('Alex');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('rejects invalid, duplicated or arbitrary IDs in profile edits', () => {
    for (const overrides of [
      [{ ...field, id: 'builtin:unknown' }],
      [field],
      [
        { ...field, id: 'builtin:first' },
        { ...field, id: 'builtin:first' },
      ],
    ])
      expect(() =>
        validateProfile({ fields: [], autoFill: true, profileOverrides: overrides }),
      ).toThrow();
    expect(() => validateProfile({ fields: [], autoFill: true, profileOverrides: {} })).toThrow(
      'Profile edits',
    );
    expect(validateProfile({ fields: [], autoFill: false }).profileOverrides).toBeUndefined();
  });
  it('reads the auto-fill preference for the active profile from a single snapshot', async () => {
    const get = vi.fn(async () => ({
      lastSyncProfile: { id: 'other' },
      [STORAGE_KEY]: {
        version: 1,
        profiles: { local: { fields: [], autoFill: true }, other: { fields: [], autoFill: false } },
      },
    }));
    vi.stubGlobal('chrome', { storage: { local: { get } } });
    try {
      expect(await getAutoFillPreference()).toEqual({ profileId: 'other', enabled: false });
      expect(get).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('imports only validated fields, dropping unknown keys', () => {
    expect(
      parseImport(
        JSON.stringify({ version: 1, fields: [{ ...field, script: 'never run' }], autoFill: true }),
      ),
    ).toEqual({ fields: [field], autoFill: true });
  });
  it('rejects malformed exports and duplicate/reserved IDs', () => {
    expect(() => parseImport('broken')).toThrow('JSON');
    expect(() => validateProfile({ fields: [field, field], autoFill: true })).toThrow('unique');
    expect(() =>
      validateProfile({ fields: [{ ...field, id: 'builtin:phone' }], autoFill: true }),
    ).toThrow('unique');
    expect(() =>
      validateProfile({ fields: [{ ...field, aliases: 'salary' }], autoFill: true }),
    ).toThrow('lists');
  });
  it('normalizes hostname scopes but rejects URLs containing paths or credentials', () => {
    expect(
      validateProfile({ fields: [{ ...field, scope: 'https://LinkedIn.com/' }], autoFill: true })
        .fields[0].scope,
    ).toBe('linkedin.com');
    expect(() =>
      validateProfile({
        fields: [{ ...field, scope: 'https://user:secret@example.com/' }],
        autoFill: true,
      }),
    ).toThrow('hostname');
    expect(() =>
      validateProfile({ fields: [{ ...field, scope: 'example.com/apply' }], autoFill: true }),
    ).toThrow('hostname');
  });
  it('derives names and phone variants from profile data without guessing a missing name', () => {
    const fields = builtInFields({
      id: 'local',
      name: 'Demo',
      personal: {
        firstName: 'Alex',
        lastName: 'Doe',
        phoneCountryCode: '+91',
        phoneNumber: '90000 00000',
      },
    });
    expect(fields.find((f) => f.id === 'builtin:middle')?.value).toBe('');
    expect(fields.find((f) => f.id === 'builtin:phone-local')?.value).toBe('9000000000');
    expect(fields.find((f) => f.id === 'builtin:phone-international')?.value).toBe('+919000000000');
    expect(fields.find((f) => f.id === 'builtin:full')?.value).toBe('Alex Doe');
  });
  it('parses an already international phone without duplicating the calling code', () => {
    const result = phoneVariants({
      phoneNumber: '+91 90000 00000',
      phoneCountryCode: '',
      country: 'India',
    });
    expect(result.national).toBe('9000000000');
    expect(result.international).toBe('+919000000000');
    expect(result.code).toBe('+91');
  });
  it('uses the saved country for national phones and avoids guessing for ambiguous short numbers', () => {
    expect(phoneVariants({ phoneNumber: '90000 00000', country: 'India' }).international).toBe(
      '+919000000000',
    );
    expect(phoneVariants({ phoneNumber: '+123' }).national).toBe('');
  });
  it('preserves hidden shortcuts in exports while accepting older profiles without that setting', () => {
    const profile = {
      fields: [field],
      autoFill: true,
      hiddenBuiltIns: ['builtin:middle', 'builtin:middle-initial', 'builtin:middle'],
    };
    expect(parseImport(JSON.stringify(profile)).hiddenBuiltIns).toEqual([
      'builtin:middle',
      'builtin:middle-initial',
    ]);
    expect(validateProfile({ fields: [field], autoFill: true }).hiddenBuiltIns).toBeUndefined();
    expect(() => validateProfile({ ...profile, hiddenBuiltIns: ['custom-id'] })).toThrow(
      'shortcut IDs',
    );
  });
  it('excludes removed shortcuts from the actual autofill library without changing profile values', async () => {
    const data = {
      profile: {
        nameData: { firstName: 'Alex', middleName: 'Jay', lastName: 'Doe' },
        contactData: {},
      },
      [STORAGE_KEY]: {
        version: 1,
        profiles: {
          local: {
            fields: [field],
            autoFill: true,
            hiddenBuiltIns: ['builtin:middle', 'builtin:middle-initial'],
          },
        },
      },
    };
    vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => data) } } });
    try {
      const library = await getActiveFields();
      expect(library.fields.some((f) => f.id === 'builtin:middle')).toBe(false);
      expect(library.fields.some((f) => f.id === 'builtin:middle-initial')).toBe(false);
      expect(library.fields.find((f) => f.id === 'builtin:full')?.value).toBe('Alex Jay Doe');
      expect(data.profile.nameData.middleName).toBe('Jay');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('accepts legacy profiles and deduplicates saved visual order without dropping hidden or stale IDs', () => {
    expect(validateProfile({ fields: [field], autoFill: true }).fieldOrder).toBeUndefined();
    const imported = parseImport(
      JSON.stringify({
        fields: [field],
        autoFill: true,
        hiddenBuiltIns: ['builtin:middle'],
        fieldOrder: ['builtin:last', field.id, 'builtin:middle', 'removed-id', 'builtin:last'],
      }),
    );
    expect(imported.fieldOrder).toEqual(['builtin:last', field.id, 'builtin:middle', 'removed-id']);
    expect(imported.hiddenBuiltIns).toEqual(['builtin:middle']);
  });
  it('rejects malformed or oversized ordering data', () => {
    for (const order of [
      null,
      'first,last',
      [7],
      [''],
      ['  '],
      ['x'.repeat(201)],
      Array(2201).fill('a'),
    ]) {
      expect(() => validateProfile({ fields: [field], autoFill: true, fieldOrder: order })).toThrow(
        'Field order',
      );
    }
    expect(
      validateProfile({ fields: [field], autoFill: true, fieldOrder: ['x'.repeat(200)] })
        .fieldOrder,
    ).toHaveLength(1);
  });
  it('round-trips ordering through save and read while leaving autofill field precedence unchanged', async () => {
    const saved = {
      fields: [field],
      autoFill: true,
      fieldOrder: ['builtin:last', field.id, 'builtin:first'],
    };
    const data = {
      profile: { nameData: { firstName: 'Alex', lastName: 'Doe' }, contactData: {} },
      [STORAGE_KEY]: {
        version: 1,
        profiles: { local: { fields: [field], autoFill: true } as typeof saved },
      },
    };
    const sendMessage = vi.fn(async (message: { profile: typeof saved }) => {
      data[STORAGE_KEY].profiles.local = message.profile;
      return { ok: true };
    });
    vi.stubGlobal('chrome', {
      storage: { local: { get: vi.fn(async () => data) } },
      runtime: { sendMessage },
    });
    try {
      await saveCustomProfile(saved, 'local');
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'eze-custom:save',
        profileId: 'local',
        profile: saved,
      });
      expect((await getCustomProfile()).fieldOrder).toEqual(saved.fieldOrder);
      const active = await getActiveFields();
      expect(active.fieldOrder).toEqual(saved.fieldOrder);
      expect(active.fields[0].id).toBe(field.id);
      expect(active.fields.findIndex((item) => item.id === 'builtin:first')).toBeLessThan(
        active.fields.findIndex((item) => item.id === 'builtin:last'),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
