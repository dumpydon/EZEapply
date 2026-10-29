import { describe, expect, it } from 'vitest';
import { normalizeProfile, parseProfileImport } from '../src/app-profile';

describe('portable applicant profile', () => {
  it('preserves legacy profile values, repeated histories, links and resume metadata', () => {
    const input = {
      profileName: 'Engineer',
      nameData: { firstName: 'Alex', middleName: 'J', lastName: 'Sharma', preferredName: false },
      websiteData: { websites: ['https://example.test/work'] },
      jobData: [
        {
          company: 'Example',
          jobTitle: 'Engineer',
          currentlyWorkHere: true,
          startDate: { month: 2, year: 2024 },
        },
      ],
      educationData: [{ school: 'Example Institute', degree: 'Bachelors' }],
      skillsData: ['Python', 'Python', 'TypeScript'],
      resumeData: {
        fileName: 'resume.pdf',
        resumeBase64: 'cGRm',
        fileSize: 3,
        dateUploaded: '2026-10-29',
      },
    };
    const result = normalizeProfile(input);
    expect(result.jobData).toEqual(input.jobData);
    expect(result.nameData).toEqual(input.nameData);
    expect(result.websiteData).toEqual(input.websiteData);
    expect(result.resumeData).toEqual(input.resumeData);
    expect(result.skillsData).toEqual(['Python', 'TypeScript']);
  });
  it('accepts raw and wrapped exports without treating answer libraries as profiles', () => {
    expect(
      parseProfileImport(JSON.stringify({ nameData: { firstName: 'Alex' } })).nameData.firstName,
    ).toBe('Alex');
    expect(
      parseProfileImport(
        JSON.stringify({ profile: { contactData: { email: 'alex@example.test' } } }),
      ).contactData.email,
    ).toBe('alex@example.test');
    expect(() => parseProfileImport('{')).toThrow('JSON');
    expect(() =>
      parseProfileImport(JSON.stringify({ profile: { fields: [], autoFill: true } })),
    ).toThrow('applicant profile');
  });
  it('rejects oversized files and histories, invalid resume types and dangerous object keys', () => {
    expect(() => normalizeProfile({ jobData: Array(101).fill({}) })).toThrow('100');
    expect(() => normalizeProfile({ jobData: { company: 'x' } })).toThrow('list');
    expect(() =>
      normalizeProfile({ resumeData: { fileName: 'payload.html', resumeBase64: 'YQ==' } }),
    ).toThrow('resume');
    expect(() =>
      normalizeProfile({ resumeData: { fileName: 'r.pdf', resumeBase64: '<script>' } }),
    ).toThrow('valid file');
    const profile = normalizeProfile(
      JSON.parse(
        '{"nameData":{"__proto__":{"polluted":true},"constructor":"bad","firstName":"Alex"}}',
      ),
    );
    expect(Object.keys(profile.nameData)).toEqual(['firstName']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
