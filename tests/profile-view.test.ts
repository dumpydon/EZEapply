// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountProfileView } from '../src/profile-view';
import { normalizeProfile } from '../src/app-profile';

let view: ReturnType<typeof mountProfileView> | undefined;
const writeText = vi.fn(async (_value: string) => {});
const longDescription =
  '- Built reliable APIs used by thousands of applicants.\n- Improved event processing and cut latency across multiple services.\n- Created a repeatable deployment workflow with audit logs and detailed diagnostics.\n- Added regression coverage and production monitoring.';
beforeEach(() => {
  vi.stubGlobal('chrome', {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
  });
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  writeText.mockClear();
});
afterEach(() => {
  view?.dispose();
  view = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount(data: unknown) {
  const profile = normalizeProfile(data),
    download = vi.fn();
  view = mountProfileView(profile, download);
  document.body.append(view.element);
  return { profile, download, element: view.element };
}
function byLabel(label: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
}

describe('compact profile presentation', () => {
  it('uses full-width job headings and shows saved company, location and structured dates', () => {
    mount({
      jobData: [
        {
          jobTitle: 'Backend Engineer',
          company: 'Example',
          location: 'Remote',
          startDate: { month: 2, year: 2024 },
          endDate: { month: 6, year: 2025 },
          currentlyWorkHere: true,
          description: longDescription,
        },
      ],
      educationData: [
        {
          school: 'Example Institute',
          degree: 'Bachelors',
          fieldOfStudy: 'Computer Science',
          startDate: '2020-08',
          endDate: '2024-06',
        },
      ],
    });
    expect(document.querySelector('.history-title')?.textContent).toBe('Backend Engineer');
    expect(document.querySelector('.history-meta')?.textContent).toBe(
      'ExampleRemoteFeb 2024 – Present',
    );
    expect(document.querySelector('.history-summary .profile-value')).toBeNull();
    expect(document.querySelectorAll('.history-meta')[1].textContent).toBe(
      'BachelorsComputer ScienceAug 2020 – Jun 2024',
    );
  });
  it('expands descriptions independently and copies their full original text from the preview', async () => {
    const data = {
      jobData: [
        { jobTitle: 'Engineer', description: longDescription },
        { jobTitle: 'Intern', description: longDescription },
      ],
    };
    const { profile } = mount(data);
    const preview = byLabel('Copy Engineer description'),
      toggle = byLabel('Show more about Engineer');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(preview.id);
    expect(toggle.hidden).toBe(false);
    preview.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(longDescription));
    expect(preview.textContent).toBe(longDescription);
    toggle.click();
    expect(preview.classList.contains('is-expanded')).toBe(true);
    expect(toggle.textContent).toBe('Show less');
    expect(byLabel('Show more about Intern').getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    expect(preview.classList.contains('is-expanded')).toBe(false);
    expect(profile.jobData[0].description).toBe(longDescription);
  });
  it('shows expansion only when rendered text overflows and recalculates after resize', () => {
    let resize: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(fn: ResizeObserverCallback) {
          resize = fn;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    mount({ jobData: [{ jobTitle: 'Engineer', description: 'One short line.' }] });
    const preview = byLabel('Copy Engineer description'),
      toggle = byLabel('Show more about Engineer');
    expect(toggle.hidden).toBe(true);
    vi.spyOn(preview, 'clientHeight', 'get').mockReturnValue(60);
    const height = vi.spyOn(preview, 'scrollHeight', 'get').mockReturnValue(100);
    const notify = () =>
      resize?.([{ target: preview } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    notify();
    expect(toggle.hidden).toBe(false);
    height.mockReturnValue(60);
    notify();
    expect(toggle.hidden).toBe(true);
    view!.dispose();
    expect(disconnect).toHaveBeenCalled();
  });
  it('shows icon labels for links while copying the complete URL and deduplicating repeated links', async () => {
    const github = 'https://github.com/example',
      project = 'https://github.com/example/a-long-project-name';
    mount({
      websiteData: {
        github,
        linkedin: 'https://www.linkedin.com/in/example/',
        personal: 'https://portfolio.example.test/',
        websites: [github, project, 'https://example.workers.dev/'],
      },
    });
    const control = byLabel('Copy GitHub URL');
    expect(control.textContent).toBe('GitHub');
    expect(control.querySelector('svg')).not.toBeNull();
    expect(control.title).toContain(github);
    expect(document.querySelectorAll('.portfolio-link')).toHaveLength(5);
    expect(document.querySelectorAll('.portfolio-link-open')).toHaveLength(5);
    expect(byLabel('Copy a-long-project-name URL').textContent).toBe('a-long-project-name');
    control.click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(github));
    expect(control.textContent).toBe('GitHub');
    const open = document.querySelector<HTMLAnchorElement>('[aria-label="Open GitHub"]')!;
    expect(open.href).toBe(github);
    expect(open.rel).toBe('noopener noreferrer');
  });
  it('never navigates imported script URLs or credential URLs and never interprets profile text as HTML', () => {
    mount({
      websiteData: { websites: ['javascript:alert(1)', 'https://secret@example.test/'] },
      jobData: [
        { jobTitle: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>' },
      ],
    });
    expect(document.querySelector('.portfolio-link-open')).toBeNull();
    expect(document.querySelector('img, script')).toBeNull();
    expect(document.querySelector('.history-title')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });
  it('makes individual skills copyable and preserves multi-line languages and boolean answers', async () => {
    mount({
      skillsData: ['TypeScript', 'Python'],
      languageData: [{ language: 'English', proficiency: 'Native' }],
      employmentData: { workAuthorization: true, sponsorship: false, age: 23 },
    });
    expect(document.querySelectorAll('.profile-skill')).toHaveLength(2);
    expect(byLabel('Copy Languages').textContent).toBe('English · Native');
    expect(byLabel('Copy Work Authorization').textContent).toBe('Yes');
    expect(byLabel('Copy Age').textContent).toBe('23');
    byLabel('Copy Python').click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('Python'));
  });
  it('keeps resume download working with a compact filename and an edit link', () => {
    const { download, profile } = mount({
      resumeData: {
        fileName: 'A long resume file.pdf',
        resumeBase64: 'YQ==',
        fileSize: 125,
        dateUploaded: '2026-10-29T20:00:00.000Z',
      },
    });
    expect(document.querySelector('.profile-resume-name')?.getAttribute('title')).toBe(
      'A long resume file.pdf',
    );
    expect(document.querySelector('.profile-resume-meta')?.textContent).toBe(
      '125 KB · Uploaded Oct 2026',
    );
    document.querySelector<HTMLButtonElement>('.profile-resume-actions button')!.click();
    expect(download).toHaveBeenCalledWith(profile.resumeData);
    expect(document.querySelector('.profile-resume-actions a')?.getAttribute('href')).toBe(
      'chrome-extension://test/options.html#/profile',
    );
  });
});
