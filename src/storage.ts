import {
  STORAGE_KEY,
  type CustomField,
  type CustomStore,
  type ProfileContext,
  type ProfileFields,
} from './types';
import { getCountries, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
import { profileAutofillFields } from './profile-fields';
import type { SavedResume } from './resume';

const emptyProfile = (): ProfileFields => ({ fields: [], autoFill: true });
const SHORTCUT_IDS = new Set(
  [
    'first',
    'middle',
    'middle-initial',
    'last',
    'full',
    'phone-local',
    'phone-international',
    'dial-code',
    'phone-formatted',
  ].map((id) => `builtin:${id}`),
);
export const emptyStore = (): CustomStore => ({ version: 1, profiles: {} });

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function contextFrom(data: Record<string, unknown>): ProfileContext {
  const profile = object(data.profile);
  const names = object(profile.nameData);
  const contact = object(profile.contactData);
  const synced = object(data.lastSyncProfile);
  return {
    id: string(synced.id) || 'local',
    name: [names.firstName, names.lastName].filter(Boolean).join(' ') || 'Your profile',
    personal: { ...names, ...contact, country: object(profile.addressData).country },
  };
}

export async function getProfileContext(): Promise<ProfileContext> {
  return contextFrom(await chrome.storage.local.get(['profile', 'lastSyncProfile']));
}

export function validateProfile(input: unknown): ProfileFields {
  const data = object(input);
  if (
    !Array.isArray(data.fields) ||
    data.fields.length > 2000 ||
    typeof data.autoFill !== 'boolean'
  ) {
    throw new Error(
      'Choose a custom-fields export with a fields list and an automatic-fill setting (up to 2,000 fields).',
    );
  }
  const validateFields = (values: unknown[], shortcuts = false): CustomField[] => {
    const seen = new Set<string>();
    return values.map((raw: unknown): CustomField => {
      const field = object(raw);
      const id = string(field.id);
      const label = string(field.label).trim();
      const value = string(field.value);
      if (
        !id ||
        (shortcuts ? !SHORTCUT_IDS.has(id) : id.startsWith('builtin:')) ||
        seen.has(id) ||
        !label ||
        label.length > 200 ||
        value.length > 30000
      ) {
        throw new Error(
          'Every field needs a unique ID, a label (up to 200 characters), and an answer under 30,000 characters.',
        );
      }
      seen.add(id);
      const list = (key: string): string[] => {
        if (
          !Array.isArray(field[key]) ||
          field[key].length > 100 ||
          field[key].some((v: unknown) => typeof v !== 'string' || v.length > 300)
        ) {
          throw new Error(
            'Matching phrases and exclusions must be text lists (up to 100 phrases, 300 characters each).',
          );
        }
        return [...new Set((field[key] as string[]).map((s) => s.trim()).filter(Boolean))];
      };
      let scope = string(field.scope).trim().toLowerCase();
      if (scope) {
        try {
          const parsed = new URL(scope.includes('://') ? scope : `https://${scope}`);
          if (
            !['http:', 'https:'].includes(parsed.protocol) ||
            parsed.username ||
            parsed.password ||
            parsed.pathname !== '/' ||
            parsed.search ||
            parsed.hash ||
            parsed.port
          )
            throw new Error();
          scope = parsed.hostname;
        } catch {
          throw new Error(
            'Site scope must be a hostname, such as linkedin.com. Leave it empty for every site.',
          );
        }
      }
      if (
        !['exact', 'phrase'].includes(string(field.matchMode)) ||
        typeof field.enabled !== 'boolean'
      ) {
        throw new Error('Each field needs an exact/phrase match mode and an enabled setting.');
      }
      return {
        id,
        label,
        value,
        aliases: list('aliases'),
        exclude: list('exclude'),
        category: string(field.category).trim().slice(0, 100) || 'Personal questions',
        enabled: field.enabled,
        matchMode: field.matchMode as 'exact' | 'phrase',
        scope,
      };
    });
  };
  const fields = validateFields(data.fields);
  if (
    data.profileOverrides !== undefined &&
    (!Array.isArray(data.profileOverrides) || data.profileOverrides.length > SHORTCUT_IDS.size)
  )
    throw new Error('Profile edits must be a list of valid profile shortcuts.');
  const profileOverrides =
    data.profileOverrides === undefined
      ? undefined
      : validateFields(data.profileOverrides as unknown[], true);
  const hidden = data.hiddenBuiltIns;
  if (
    hidden !== undefined &&
    (!Array.isArray(hidden) ||
      hidden.length > 100 ||
      hidden.some((id) => typeof id !== 'string' || !/^builtin:[a-z-]{1,80}$/.test(id)))
  ) {
    throw new Error('Hidden profile shortcuts must be a list of valid shortcut IDs.');
  }
  const order = data.fieldOrder;
  if (
    order !== undefined &&
    (!Array.isArray(order) ||
      order.length > 2200 ||
      order.some((id) => typeof id !== 'string' || !id.trim() || id.length > 200))
  ) {
    throw new Error(
      'Field order must be a list of up to 2,200 nonempty field IDs, each at most 200 characters.',
    );
  }
  return {
    fields,
    autoFill: data.autoFill,
    ...(hidden === undefined ? {} : { hiddenBuiltIns: [...new Set(hidden as string[])] }),
    ...(order === undefined ? {} : { fieldOrder: [...new Set(order as string[])] }),
    ...(profileOverrides === undefined ? {} : { profileOverrides }),
  };
}

export function parseImport(text: string): ProfileFields {
  if (text.length > 10_000_000)
    throw new Error('This file is too large. Choose a custom-fields export under 10 MB.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const container = object(data);
  return validateProfile(container.profile ?? data);
}

export async function getCustomProfile(): Promise<ProfileFields> {
  const data = await chrome.storage.local.get(['profile', 'lastSyncProfile', STORAGE_KEY]);
  const { id } = contextFrom(data);
  const store = data[STORAGE_KEY] as CustomStore | undefined;
  return store?.version === 1 && store.profiles?.[id]
    ? validateProfile(store.profiles[id])
    : emptyProfile();
}

export async function saveCustomProfile(
  profile: ProfileFields,
  expectedProfileId?: string,
): Promise<void> {
  const { id } = await getProfileContext();
  if (expectedProfileId && id !== expectedProfileId)
    throw new Error('Your profile changed. Reopen the editor for the current profile.');
  const validated = validateProfile(profile);
  const result = await chrome.runtime.sendMessage({
    type: 'eze-custom:save',
    profileId: id,
    profile: validated,
  });
  if (!result?.ok)
    throw new Error(result?.error || 'Your fields could not be saved. Please try again.');
}

/** Read identity and preference together so a profile switch cannot mix them. */
export async function getAutoFillPreference(): Promise<{ profileId: string; enabled: boolean }> {
  const data = await chrome.storage.local.get(['profile', 'lastSyncProfile', STORAGE_KEY]);
  const { id } = contextFrom(data);
  const store = data[STORAGE_KEY] as CustomStore | undefined;
  const saved =
    store?.version === 1 && store.profiles?.[id]
      ? validateProfile(store.profiles[id])
      : emptyProfile();
  return { profileId: id, enabled: saved.autoFill };
}

/** Change only this preference; concurrent field edits remain intact. */
export async function setAutoFillPreference(
  enabled: boolean,
  expectedProfileId: string,
): Promise<void> {
  const result = await chrome.runtime.sendMessage({
    type: 'eze-custom:auto-fill',
    profileId: expectedProfileId,
    enabled,
  });
  if (!result?.ok)
    throw new Error(result?.error || 'Automatic filling could not be saved. Please try again.');
}

export function phoneVariants(personal: Record<string, unknown>): {
  national: string;
  international: string;
  code: string;
  formatted: string;
} {
  const raw = string(personal.phoneNumber).trim();
  const countryName = string(personal.country).trim();
  const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const country = getCountries().find(
    (code) =>
      code.toLowerCase() === countryName.toLowerCase() ||
      countryNames.of(code)?.toLowerCase() === countryName.toLowerCase(),
  ) as CountryCode | undefined;
  const legacyCode = string(personal.phoneCountryCode).replace(/\D/g, '');
  const candidate =
    raw.startsWith('+') || !legacyCode || country ? raw : `+${legacyCode}${raw.replace(/\D/g, '')}`;
  const parsed = parsePhoneNumberFromString(candidate, country);
  if (parsed?.isPossible())
    return {
      national: parsed.nationalNumber,
      international: parsed.number,
      code: `+${parsed.countryCallingCode}`,
      formatted: parsed.formatInternational(),
    };
  // Do not guess where a country code ends when parsing is inconclusive.
  return {
    national: raw.startsWith('+') ? '' : raw.replace(/\D/g, ''),
    international: raw.startsWith('+') ? raw : '',
    code: '',
    formatted: raw,
  };
}

export function builtInFields(context: ProfileContext): CustomField[] {
  const p = context.personal;
  const phone = phoneVariants(p);
  const create = (
    id: string,
    label: string,
    value: string,
    aliases: string[],
    exclude: string[] = [],
  ): CustomField => ({
    id: `builtin:${id}`,
    label,
    value,
    aliases,
    exclude,
    category: 'Name & phone',
    enabled: true,
    matchMode: 'phrase',
    scope: '',
  });
  return [
    create(
      'first',
      'First name',
      string(p.firstName),
      ['given name', 'forename'],
      ['last', 'middle', 'surname'],
    ),
    create('middle', 'Middle name', string(p.middleName), []),
    create('middle-initial', 'Middle initial', string(p.middleName).trim().slice(0, 1), []),
    create(
      'last',
      'Last name',
      string(p.lastName),
      ['family name', 'surname'],
      ['first', 'middle'],
    ),
    create('full', 'Full name', [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' '), [
      'legal name',
      'full legal name',
    ]),
    create(
      'phone-local',
      'Phone number only',
      phone.national,
      [
        'mobile number',
        'phone',
        'phone number',
        'mobile',
        'telephone number',
        'contact number',
        'phone without country code',
        'mobile without country code',
        'phone national number',
      ],
      [
        'phone country code',
        'dial code',
        'international',
        'including country code',
        'with country code',
        'extension',
        'alternate',
        'alternative',
        'secondary',
        'emergency',
        'reference',
      ],
    ),
    create('phone-international', 'Phone with country code', phone.international, [
      'international phone',
      'phone including country code',
      'mobile with country code',
      'international mobile',
    ]),
    create('dial-code', 'Phone country code', phone.code, [
      'dial code',
      'dialing code',
      'phone dialling code',
    ]),
    { ...create('phone-formatted', 'Phone formatted', phone.formatted, []), enabled: false },
  ];
}

function profileShortcuts(context: ProfileContext, profile: ProfileFields): CustomField[] {
  const hidden = new Set(profile.hiddenBuiltIns || []);
  const overrides = new Map(profile.profileOverrides?.map((field) => [field.id, field]));
  return builtInFields(context)
    .filter((field) => !hidden.has(field.id))
    .map((field) => ({ ...field, ...overrides.get(field.id) }));
}

export async function getActiveFields(): Promise<ProfileFields> {
  const data = await chrome.storage.local.get(['profile', 'lastSyncProfile', STORAGE_KEY]);
  const context = contextFrom(data);
  const store = data[STORAGE_KEY] as CustomStore | undefined;
  const profile =
    store?.version === 1 && store.profiles?.[context.id]
      ? validateProfile(store.profiles[context.id])
      : emptyProfile();
  return { ...profile, fields: [...profile.fields, ...profileShortcuts(context, profile)] };
}

/** Use one storage snapshot so a profile switch cannot mix identity and answers. */
export async function getAutofillData(): Promise<
  ProfileFields & { resume?: SavedResume; profileId?: string }
> {
  const data = await chrome.storage.local.get([
    'profile',
    'lastSyncProfile',
    STORAGE_KEY,
    'autofillEnabled',
  ]);
  const context = contextFrom(data);
  const store = data[STORAGE_KEY] as CustomStore | undefined;
  const saved =
    store?.version === 1 && store.profiles?.[context.id]
      ? validateProfile(store.profiles[context.id])
      : emptyProfile();
  const semantics: Record<string, string[]> = {
    'builtin:first': ['given-name'],
    'builtin:middle': ['additional-name'],
    'builtin:last': ['family-name'],
    'builtin:full': ['name'],
    'builtin:phone-local': ['tel-national'],
    'builtin:phone-international': ['tel'],
    'builtin:dial-code': ['tel-country-code'],
  };
  const shortcuts = profileShortcuts(context, saved).map((field) => ({
    ...field,
    autocomplete: semantics[field.id],
  }));
  const profile = object(data.profile);
  const resume = object(profile.resumeData);
  return {
    ...saved,
    autoFill: saved.autoFill && data.autofillEnabled !== false,
    profileId: context.id,
    fields: [...saved.fields, ...shortcuts, ...profileAutofillFields(profile)],
    ...(string(resume.fileName) && string(resume.resumeBase64)
      ? { resume: { fileName: string(resume.fileName), resumeBase64: string(resume.resumeBase64) } }
      : {}),
  };
}
