import { STORAGE_KEY } from '../types';

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const SECRET_FIELD =
  /password|passcode|api.?key|secret|token|credential|bank|card number|social security|ssn/i;
function clean(value: unknown, depth = 0): unknown {
  if (depth > 5) return undefined;
  if (typeof value === 'string') return value.slice(0, 4000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => clean(item, depth + 1));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(object(value))
        .filter(([key]) => !SECRET_FIELD.test(key) && !/base64|file|blob|avatar|photo/i.test(key))
        .slice(0, 40)
        .map(([key, item]) => [key, clean(item, depth + 1)]),
    );
  return undefined;
}
export function applicantFacts(
  data: Record<string, unknown>,
  hostname: string,
): Record<string, unknown> {
  const profile = object(data.profile),
    sync = object(data.lastSyncProfile),
    store = object(data[STORAGE_KEY]);
  const id = typeof sync.id === 'string' ? sync.id : 'local';
  const custom = object(object(store.profiles)[id]);
  const fields = Array.isArray(custom.fields) ? custom.fields : [];
  const answers = fields
    .map(object)
    .filter(
      (field) =>
        field.enabled === true &&
        typeof field.label === 'string' &&
        typeof field.value === 'string' &&
        field.value.trim() &&
        !SECRET_FIELD.test(field.label) &&
        (!field.scope ||
          (typeof field.scope === 'string' &&
            (hostname === field.scope || hostname.endsWith('.' + field.scope)))),
    )
    .slice(0, 150)
    .map((field) => ({ question: field.label, answer: String(field.value).slice(0, 3000) }));
  const facts: Record<string, unknown> = {};
  // Use a positive list; authentication/account storage and raw files never leave the extension.
  for (const key of [
    'nameData',
    'contactData',
    'addressData',
    'websiteData',
    'skillsData',
    'jobData',
    'educationData',
    'languageData',
  ]) {
    if (profile[key]) facts[key] = clean(profile[key]);
  }
  const employment = object(profile.employmentData);
  const { eligibilityUS, ...employmentDetails } = employment;
  facts.employment = clean({
    ...employmentDetails,
    // This legacy key records authorization in the
    // country of residence. Never present its misleading key name as US status.
    authorizedToWorkInCountryOfResidence: eligibilityUS,
    countryOfResidence: object(profile.addressData).country,
  });
  facts.savedAnswers = answers;
  // Keep prompt size predictable. Prefer the profile and earliest saved answers.
  while (JSON.stringify(facts).length > 48000 && answers.length) answers.pop();
  if (JSON.stringify(facts).length > 60000)
    throw new Error(
      'The saved profile is too large for this request. Disable profile context and add a short background in AI settings.',
    );
  return facts;
}
