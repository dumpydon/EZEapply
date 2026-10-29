import type { FillReport } from './types';

export interface SavedResume {
  fileName: string;
  resumeBase64: string;
  /** Stored metadata is in KiB. */ fileSize?: number;
}
export interface ResumeInput {
  element: HTMLInputElement;
  label: string;
  reason?: string;
}
const MAX_BYTES = 20 * 1024 * 1024;
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
};
const identities = new WeakMap<Element, string>();
let identityCount = 0;
const attachments: { element: HTMLInputElement; file: File }[] = [];
function id(element: Element): string {
  let value = identities.get(element);
  if (!value) {
    value = `resume-${++identityCount}`;
    identities.set(element, value);
  }
  return value;
}
function text(element: Element | null): string {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600);
}
function parent(element: Element): Element | null {
  return element.parentElement || (element.getRootNode() as ShadowRoot).host || null;
}
function visible(element: Element): boolean {
  if (!element.isConnected) return false;
  for (let node: Element | null = element; node; node = parent(node)) {
    const style = element.ownerDocument.defaultView?.getComputedStyle(node);
    if (
      node.hasAttribute('hidden') ||
      node.getAttribute('aria-hidden') === 'true' ||
      node.hasAttribute('inert') ||
      style?.display === 'none' ||
      style?.visibility === 'hidden'
    )
      return false;
  }
  return true;
}
function roots(root: Document | ShadowRoot): (Document | ShadowRoot)[] {
  return [
    root,
    ...[...root.querySelectorAll('*')].flatMap((element) =>
      element.shadowRoot ? roots(element.shadowRoot) : [],
    ),
  ];
}
function clean(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}
function labelledBy(element: Element): string {
  const root = element.getRootNode() as Document | ShadowRoot;
  return (element.getAttribute('aria-labelledby') || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((key) => text(root.getElementById(key)))
    .join(' ');
}
function description(input: HTMLInputElement): {
  label: string;
  context: Element | null;
  labelled: boolean;
} {
  const direct = [
    labelledBy(input),
    input.getAttribute('aria-label'),
    ...[...(input.labels || [])].map(text),
  ]
    .filter(Boolean)
    .join(' ');
  let context: Element | null = null;
  let nearby = '';
  for (
    let node = input.parentElement, level = 0;
    node && level < 4;
    node = node.parentElement, level++
  ) {
    if (node.matches('form,body,html') || node.querySelectorAll('input[type="file"]').length !== 1)
      break;
    if (
      node.matches(
        'fieldset,[data-automation-id*="upload"],[data-testid*="upload"],[class*="upload"],[class*="Upload"],[class*="dropzone"],[class*="field"],[class*="Field"]',
      )
    ) {
      const candidate = text(node);
      if (candidate.length <= 500) {
        context = node;
        nearby = candidate;
        break;
      }
    }
  }
  return {
    label: [direct, nearby, input.name, input.id, input.getAttribute('data-automation-id')]
      .filter(Boolean)
      .join(' ')
      .trim(),
    context,
    labelled: !!direct,
  };
}

/** Report every upload input so ambiguous and unsupported uploads are explained,
 * but only clearly identified resume/CV slots are eligible for attachment. */
export function scanResumeInputs(document: Document): ResumeInput[] {
  return roots(document).flatMap((root) =>
    [...root.querySelectorAll<HTMLInputElement>('input[type="file"]')].map((element) => {
      const info = description(element);
      const label = info.label || 'Unlabelled file upload';
      const normalized = clean(label);
      let reason: string | undefined;
      if (!/\b(resume|cv|curriculum vitae)\b/.test(normalized))
        reason = 'Upload is not explicitly identified as a resume or CV';
      if (
        /\b(cover letter|coverletter|photo|photograph|picture|certificate|certification|transcript|passport|identity|portfolio)\b/.test(
          normalized,
        )
      )
        reason = 'This upload asks for a different or ambiguous document';
      if (element.files?.length) reason = 'Existing attachment preserved';
      if (element.disabled || element.getAttribute('aria-disabled') === 'true')
        reason = 'Resume upload is disabled';
      if (
        !visible(element) &&
        !(info.context && visible(info.context)) &&
        ![...(element.labels || [])].some(visible)
      )
        reason = 'Upload is hidden without a visible upload control';
      return { element, label, ...(reason ? { reason } : {}) };
    }),
  );
}

function decode(saved: SavedResume, document: Document): File {
  const name =
    typeof saved.fileName === 'string' ? saved.fileName.split(/[\\/]/).at(-1)?.trim() || '' : '';
  const extension = name.split('.').at(-1)?.toLowerCase() || '';
  if (!name || !TYPES[extension])
    throw new Error('Save a PDF, DOC, DOCX, TXT, RTF or ODT resume in your profile first.');
  if (typeof saved.resumeBase64 !== 'string' || !saved.resumeBase64.trim())
    throw new Error('No saved resume is available in your profile.');
  let data = saved.resumeBase64.trim();
  if (data.startsWith('data:')) {
    const match = /^data:[^;,]*;base64,([\s\S]*)$/.exec(data);
    if (!match)
      throw new Error('The saved resume data URL is invalid. Replace the resume in your profile.');
    data = match[1];
  }
  data = data.replace(/\s/g, '');
  if (
    !data ||
    data.length > Math.ceil(MAX_BYTES / 3) * 4 + 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data) ||
    data.length % 4 === 1
  )
    throw new Error('The saved resume is invalid or larger than the 20 MB local limit.');
  let binary: string;
  try {
    binary = document.defaultView!.atob(data);
  } catch {
    throw new Error('The saved resume could not be decoded. Replace it in your profile.');
  }
  if (!binary.length || binary.length > MAX_BYTES)
    throw new Error('The saved resume is empty or larger than the 20 MB local limit.');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new document.defaultView!.File([bytes], name, { type: TYPES[extension] });
}
function accepted(input: HTMLInputElement, file: File): boolean {
  const patterns = input.accept
    .toLowerCase()
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    !patterns.length ||
    patterns.some(
      (pattern) =>
        pattern === '*/*' ||
        (pattern.startsWith('.') && file.name.toLowerCase().endsWith(pattern)) ||
        (pattern.endsWith('/*') && file.type.startsWith(pattern.slice(0, -1))) ||
        pattern === file.type,
    )
  );
}
function events(input: HTMLInputElement): void {
  const win = input.ownerDocument.defaultView!;
  input.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new win.Event('change', { bubbles: true, composed: true }));
}
function sameFile(left: File | undefined, right: File): boolean {
  return (
    !!left &&
    left.name === right.name &&
    left.size === right.size &&
    left.type === right.type &&
    left.lastModified === right.lastModified
  );
}

/** An explicit user attachment action. File-input changes may start a website
 * upload immediately; this method never clicks Next or Submit. */
export async function attachResume(document: Document, saved: SavedResume): Promise<FillReport> {
  const report: FillReport = { filled: 0, skipped: 0, questions: [] };
  const targets = scanResumeInputs(document);
  let file: File;
  try {
    file = decode(saved, document);
  } catch (error) {
    return {
      ...report,
      error: error instanceof Error ? error.message : 'Unable to read saved resume.',
    };
  }
  for (const target of targets) {
    const input = target.element;
    let reason = target.reason;
    let filled = false;
    if (!reason && !accepted(input, file))
      reason = 'This upload does not accept the saved resume file type';
    if (!reason) {
      try {
        const transfer = new document.defaultView!.DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        events(input);
        if (sameFile(input.files?.[0], file)) {
          attachments.push({ element: input, file });
          filled = true;
          reason = 'Resume attached to the file input; check the website upload status';
        } else reason = 'The page did not retain the resume attachment; upload it manually';
      } catch {
        reason = 'This upload needs a manual file selection';
      }
    }
    if (filled) report.filled++;
    else report.skipped++;
    report.questions.push({
      id: id(input),
      label: target.label,
      kind: 'file',
      filled: filled || !!input.files?.length,
      reason,
    });
  }
  if (!targets.length)
    report.error = 'No file upload inputs found. Open the resume upload step and try again.';
  return report;
}

/** Clears only unchanged local file inputs; it cannot recall a server upload. */
export function undoResumeAttachments(): FillReport {
  let filled = 0,
    skipped = 0;
  for (const { element, file } of attachments.splice(0).reverse()) {
    if (!element.isConnected || element.files?.length !== 1 || !sameFile(element.files[0], file)) {
      skipped++;
      continue;
    }
    try {
      element.value = '';
      events(element);
      if (!element.files?.length) filled++;
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return {
    filled,
    skipped,
    questions: [],
    ...(filled
      ? {
          error:
            'Cleared local file inputs only. Any upload already sent to the employer must be removed on that website.',
        }
      : {}),
  };
}
