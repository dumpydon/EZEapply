// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { pdfUploadInput, deliverPDF } from '../src/cv-drop-target';
afterEach(() => document.body.replaceChildren());
it('finds a hidden PDF input behind the upload button, including a child icon', () => {
  document.body.innerHTML =
    '<section><a href="javascript:;">Select PDF <span>↑</span></a><div><input type="file" accept="application/pdf" hidden></div></section>';
  expect(pdfUploadInput(document.querySelector('span')!)).toBe(document.querySelector('input'));
});
it('follows explicit label associations', () => {
  document.body.innerHTML = '<label for="pdf"><b>Upload</b></label><input id="pdf" type="file">';
  expect(pdfUploadInput(document.querySelector('b')!)).toBe(document.querySelector('input'));
});
it('does not guess between multiple uploads or use disabled or non-PDF inputs', () => {
  for (const attributes of ['', 'disabled', 'accept="image/*"']) {
    document.body.innerHTML = `<section><button>Drop</button><input type="file" ${attributes}><input type="file" ${attributes}></section>`;
    expect(pdfUploadInput(document.querySelector('button')!)).toBeUndefined();
  }
});
it('does not reach unrelated file inputs elsewhere on the page', () => {
  document.body.innerHTML = '<div><button>Drop</button></div><aside><input type="file"></aside>';
  expect(pdfUploadInput(document.querySelector('button')!)).toBeUndefined();
});
it('rejects detached targets instead of silently losing a file', () => {
  expect(() => deliverPDF(document.createElement('div'), new File(['pdf'], 'a.pdf'))).toThrow(
    'changed',
  );
});
it('delivers bytes through the associated native input and dispatches change', () => {
  document.body.innerHTML = '<section><button>Upload</button><input type="file" hidden></section>';
  const file = new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
  const input = document.querySelector('input')!;
  let files: File[] = [];
  Object.defineProperty(input, 'files', {
    set: (value) => {
      files = value;
    },
    get: () => files,
  });
  vi.stubGlobal(
    'DataTransfer',
    class {
      files: File[] = [];
      items = { add: (value: File) => this.files.push(value) };
    },
  );
  const changed = vi.fn();
  input.addEventListener('change', changed);
  expect(deliverPDF(document.querySelector('button')!, file)).toBe('input');
  expect(files[0]).toBe(file);
  expect(changed).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});

it('replays the complete drag lifecycle for custom upload widgets', () => {
  document.body.innerHTML = '<div id="drop"><span>Upload CV</span></div>';
  vi.stubGlobal(
    'DataTransfer',
    class {
      files: File[] = [];
      items = { add: (value: File) => this.files.push(value) };
    },
  );
  vi.stubGlobal(
    'DragEvent',
    class extends Event {
      dataTransfer: unknown;
      constructor(type: string, init: any) {
        super(type, init);
        this.dataTransfer = init.dataTransfer;
      }
    },
  );
  const received: string[] = [];
  const file = new File(['%PDF-1.4'], 'Custom.pdf');
  for (const type of ['dragenter', 'dragover', 'drop'])
    document.querySelector('#drop')!.addEventListener(type, (event) => {
      received.push(type);
      expect((event as DragEvent).dataTransfer?.files[0]).toBe(file);
    });
  expect(deliverPDF(document.querySelector('span')!, file)).toBe('drop');
  expect(received).toEqual(['dragenter', 'dragover', 'drop']);
  vi.unstubAllGlobals();
});
