/** EZEapply's local applicant model. Existing local profile keys stay readable. */
export interface ApplicantProfile {
  profileName: string;
  nameData: Record<string, unknown>;
  contactData: Record<string, unknown>;
  addressData: Record<string, unknown>;
  websiteData: Record<string, unknown>;
  employmentData: Record<string, unknown>;
  resumeData: Record<string, unknown>;
  jobData: Record<string, unknown>[];
  educationData: Record<string, unknown>[];
  languageData: Record<string, unknown>[];
  skillsData: string[];
}
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function safeValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.slice(0, 30000);
  if (
    typeof value === 'boolean' ||
    value === null ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return value;
  if (depth >= 4) return undefined;
  if (Array.isArray(value))
    return value
      .slice(0, 100)
      .map((item) => safeValue(item, depth + 1))
      .filter((item) => item !== undefined);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(record(value))
        .slice(0, 80)
        .filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key))
        .map(([key, item]) => [key, safeValue(item, depth + 1)])
        .filter(([, item]) => item !== undefined),
    );
  return undefined;
}
function fields(value: unknown): Record<string, unknown> {
  return record(safeValue(record(value)));
}
export function normalizeProfile(input: unknown): ApplicantProfile {
  const raw = record(input);
  const profile: ApplicantProfile = {
    profileName: string(raw.profileName).slice(0, 100) || 'My profile',
    nameData: fields(raw.nameData),
    contactData: fields(raw.contactData),
    addressData: fields(raw.addressData),
    websiteData: fields(raw.websiteData),
    employmentData: fields(raw.employmentData),
    resumeData: {},
    jobData: [],
    educationData: [],
    languageData: [],
    skillsData: [],
  };
  for (const key of ['jobData', 'educationData', 'languageData'] as const) {
    const values = raw[key];
    if (values !== undefined && !Array.isArray(values))
      throw new Error('Profile history must be a list.');
    if (Array.isArray(values)) {
      if (values.length > 100)
        throw new Error('A profile can contain up to 100 entries in each history section.');
      profile[key] = values.map(fields);
    }
  }
  profile.skillsData = Array.isArray(raw.skillsData)
    ? [
        ...new Set(
          raw.skillsData
            .filter((v): v is string => typeof v === 'string')
            .map((v) => v.trim().slice(0, 200))
            .filter(Boolean),
        ),
      ].slice(0, 300)
    : [];
  const resume = record(raw.resumeData),
    bytes = string(resume.resumeBase64);
  if (bytes.length > 28_000_000) throw new Error('Choose a resume smaller than 20 MB.');
  if (bytes && !/^(?:data:[\w.+/-]+;base64,)?[A-Za-z0-9+/]*={0,2}$/.test(bytes))
    throw new Error('The resume data is not a valid file.');
  if (bytes && !/\.(pdf|doc|docx|txt|rtf|odt)$/i.test(string(resume.fileName)))
    throw new Error('Choose a PDF, DOC, DOCX, text, RTF or ODT resume.');
  profile.resumeData = {
    fileName: string(resume.fileName)
      .replace(/[\u0000-\u001f/\\]/g, '')
      .slice(0, 240),
    resumeBase64: bytes,
    fileSize:
      typeof resume.fileSize === 'number' && Number.isFinite(resume.fileSize)
        ? Math.max(0, resume.fileSize)
        : 0,
    dateUploaded: string(resume.dateUploaded).slice(0, 100),
  };
  return profile;
}
export function parseProfileImport(text: string): ApplicantProfile {
  if (text.length > 32_000_000) throw new Error('Choose a profile export smaller than 32 MB.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Choose a valid JSON profile export.');
  }
  const container = record(parsed),
    raw = record(container.profile || container.profileData || container);
  if (!raw.nameData && !raw.contactData && !raw.educationData)
    throw new Error(
      'This is not an applicant profile export. Import reusable answers from Your fields instead.',
    );
  return normalizeProfile(raw);
}
