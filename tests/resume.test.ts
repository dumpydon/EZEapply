// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { attachResume, scanResumeInputs, undoResumeAttachments } from '../src/resume';

const resume = {
  fileName: 'Alex-resume.pdf',
  resumeBase64: btoa('%PDF-1.7\nDemo CV'),
  fileSize: 0.02,
};
const fileLists = new WeakMap<HTMLInputElement, File[]>();
const filesDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')!;
const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
class Transfer {
  files: File[] = [];
  items = {
    add: (file: File) => {
      this.files.push(file);
    },
  };
}
function input(id = 'resume'): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}
beforeEach(() => {
  document.body.innerHTML =
    '<label for="resume">Upload your resume</label><input id="resume" type="file" accept=".pdf,.docx">';
  Object.defineProperty(HTMLInputElement.prototype, 'files', {
    configurable: true,
    get() {
      return fileLists.get(this) || [];
    },
    set(files: File[]) {
      fileLists.set(this, [...files]);
    },
  });
  Object.defineProperty(HTMLInputElement.prototype, 'value', {
    configurable: true,
    get: valueDescriptor.get,
    set(value: string) {
      valueDescriptor.set!.call(this, value);
      if (this.type === 'file' && value === '') fileLists.set(this, []);
    },
  });
  vi.stubGlobal('DataTransfer', Transfer);
});
afterEach(() => {
  undoResumeAttachments();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  Object.defineProperty(HTMLInputElement.prototype, 'files', filesDescriptor);
  Object.defineProperty(HTMLInputElement.prototype, 'value', valueDescriptor);
});

describe('explicit resume attachment', () => {
  it('attaches the saved bytes to a clearly labelled input and emits both change events', async () => {
    const events: string[] = [];
    input().addEventListener('input', () => events.push('input'));
    input().addEventListener('change', () => events.push('change'));
    const report = await attachResume(document, resume);
    expect(report.filled).toBe(1);
    expect(input().files?.[0].name).toBe('Alex-resume.pdf');
    expect(input().files?.[0].type).toBe('application/pdf');
    expect(events).toEqual(['input', 'change']);
    expect(report.questions[0].reason).toContain('check the website upload status');
  });
  it('accepts a data URL while preserving the supported document type', async () => {
    const report = await attachResume(document, {
      fileName: 'CV.docx',
      resumeBase64: 'data:application/octet-stream;base64,' + btoa('PK sample'),
    });
    expect(report.filled).toBe(1);
    expect(input().files?.[0].type).toContain('wordprocessingml');
  });
  it('does not replace a file already chosen by the user', async () => {
    input().files = [
      new File(['mine'], 'mine.pdf', { type: 'application/pdf' }),
    ] as unknown as FileList;
    const report = await attachResume(document, resume);
    expect(report.filled).toBe(0);
    expect(input().files?.[0].name).toBe('mine.pdf');
    expect(report.questions[0].reason).toContain('preserved');
  });
  it('does not attach to cover-letter, portfolio or generic upload slots', async () => {
    document.body.innerHTML =
      '<label>Cover letter<input type="file" id="cover"></label><label>Portfolio or CV<input type="file" id="portfolio"></label><input type="file" id="generic">';
    const report = await attachResume(document, resume);
    expect(report.filled).toBe(0);
    expect(report.skipped).toBe(3);
  });
  it('recognizes a hidden input backing a visible upload wrapper', async () => {
    document.body.innerHTML =
      '<div class="upload-field"><span>Attach résumé</span><button type="button">Browse</button><input type="file" hidden id="resume"></div>';
    expect((await attachResume(document, resume)).filled).toBe(1);
  });
  it('ignores a whole hidden step or disabled upload even if it says resume', async () => {
    document.body.innerHTML =
      '<div class="upload-field" hidden>Resume<input type="file" id="resume"></div><label>CV<input id="disabled" type="file" disabled></label>';
    expect((await attachResume(document, resume)).filled).toBe(0);
    expect(scanResumeInputs(document).every((item) => item.reason)).toBe(true);
  });
  it('obeys file extension and MIME accept restrictions', async () => {
    input().accept = '.docx';
    expect((await attachResume(document, resume)).questions[0].reason).toContain('does not accept');
    input().accept = 'application/pdf';
    expect((await attachResume(document, resume)).filled).toBe(1);
  });
  it('rejects corrupt, empty, over-limit and unsupported data without touching inputs', async () => {
    for (const saved of [
      { ...resume, resumeBase64: '!invalid!' },
      { ...resume, resumeBase64: '' },
      { ...resume, fileName: 'payload.exe' },
      { ...resume, resumeBase64: 'A'.repeat(28_000_000) },
    ]) {
      const report = await attachResume(document, saved);
      expect(report.error).toBeTruthy();
      expect(input().files).toHaveLength(0);
    }
  });
  it('reports browsers or websites that reject programmatic files', async () => {
    vi.stubGlobal('DataTransfer', undefined);
    const report = await attachResume(document, resume);
    expect(report.filled).toBe(0);
    expect(report.questions[0].reason).toContain('manual file selection');
  });
  it('supports an explicit CV input in an open shadow root', async () => {
    document.body.replaceChildren();
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<input type="file" aria-label="Curriculum vitae" id="cv">';
    expect((await attachResume(document, resume)).filled).toBe(1);
  });
  it('undo clears only the local unchanged file input and reports the server limitation', async () => {
    await attachResume(document, resume);
    const report = undoResumeAttachments();
    expect(report.filled).toBe(1);
    expect(input().files).toHaveLength(0);
    expect(report.error).toContain('already sent');
  });
  it('undo preserves a replacement file and does not repeat prior undo work', async () => {
    await attachResume(document, resume);
    input().files = [
      new File(['revised'], 'revised.pdf', { type: 'application/pdf' }),
    ] as unknown as FileList;
    expect(undoResumeAttachments().skipped).toBe(1);
    expect(input().files?.[0].name).toBe('revised.pdf');
    expect(undoResumeAttachments().skipped).toBe(0);
  });
  it('reports when the page has no file input', async () => {
    document.body.replaceChildren();
    expect((await attachResume(document, resume)).error).toContain('No file upload');
  });
});
