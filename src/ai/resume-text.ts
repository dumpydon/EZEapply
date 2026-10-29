/** PDF extraction stays local. Text remains reviewable and is reused verbatim
 * as applicant background; this module performs no AI or embedding requests. */
interface TextItem {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
  width?: number;
  height?: number;
}
interface LinkAnnotation {
  url?: string;
  rect?: number[];
}
export interface ResumeText {
  text: string;
  pagesRead: number;
  totalPages: number;
  truncated: boolean;
  links: number;
}

function isText(value: unknown): value is TextItem {
  return !!value && typeof value === 'object' && typeof (value as TextItem).str === 'string';
}
function position(item: TextItem): { x: number; y: number; size: number } | undefined {
  const matrix = item.transform;
  if (!matrix || matrix.length < 6 || !matrix.every(Number.isFinite)) return;
  return {
    x: matrix[4],
    y: matrix[5],
    size: Math.max(1, item.height || Math.hypot(matrix[2], matrix[3]) || 10),
  };
}
function clean(text: string): string {
  return text.normalize('NFKC').replace(/\0/g, '').replace(/\r\n?/g, '\n');
}

export function formatPDFPage(
  values: unknown[],
  annotations: LinkAnnotation[] = [],
): { text: string; links: number } {
  const items = values.filter(isText);
  let text = '',
    previous: TextItem | undefined;
  for (const item of items) {
    const fragment = clean(item.str);
    const currentPosition = position(item),
      priorPosition = previous && position(previous);
    if (fragment && text && !text.endsWith('\n')) {
      const newLine =
        currentPosition &&
        priorPosition &&
        Math.abs(currentPosition.y - priorPosition.y) >
          Math.max(2, Math.min(currentPosition.size, priorPosition.size) * 0.45);
      if (newLine) text += '\n';
      else if (!/\s$/.test(text) && !/^\s/.test(fragment)) {
        const gap =
          currentPosition && priorPosition && previous?.width !== undefined
            ? currentPosition.x - priorPosition.x - previous.width
            : undefined;
        if (gap === undefined || gap > Math.max(0.5, (currentPosition?.size || 10) * 0.12))
          text += ' ';
      }
    }
    text += fragment;
    if (item.hasEOL && !text.endsWith('\n')) text += '\n';
    if (fragment.trim()) previous = item;
  }
  const links: string[] = [],
    seen = new Set<string>();
  for (const annotation of annotations.slice(0, 100)) {
    if (!annotation.url) continue;
    let url: URL;
    try {
      url = new URL(annotation.url);
    } catch {
      continue;
    }
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      seen.has(url.href) ||
      text.includes(url.href)
    )
      continue;
    seen.add(url.href);
    const rect = annotation.rect;
    const anchor =
      rect?.length === 4
        ? items
            .filter((item) => {
              const p = position(item);
              return (
                p &&
                p.x >= Math.min(rect[0], rect[2]) - 2 &&
                p.x <= Math.max(rect[0], rect[2]) + 2 &&
                p.y >= Math.min(rect[1], rect[3]) - 2 &&
                p.y <= Math.max(rect[1], rect[3]) + 2
              );
            })
            .map((item) => item.str.trim())
            .filter(Boolean)
            .join(' ')
            .slice(0, 120)
        : '';
    links.push(`${anchor ? anchor + ': ' : ''}${url.href}`);
  }
  text = text
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    text: text + (links.length ? `\n\nLinks\n${links.join('\n')}` : ''),
    links: links.length,
  };
}

export async function extractResumePDF(bytes: Uint8Array): Promise<ResumeText> {
  const pdf = await import(/* @vite-ignore */ chrome.runtime.getURL('custom/pdf.mjs'));
  pdf.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('custom/pdf.worker.mjs');
  const task = pdf.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
    standardFontDataUrl: chrome.runtime.getURL('custom/pdf-fonts/'),
  });
  try {
    const document = await task.promise;
    const pages: string[] = [];
    let size = 0,
      pagesRead = 0,
      links = 0;
    for (let page = 1; page <= Math.min(document.numPages, 30); page++) {
      const source = await document.getPage(page),
        content = await source.getTextContent();
      const annotations = await source.getAnnotations({ intent: 'display' });
      const formatted = formatPDFPage(content.items, annotations);
      pages.push(formatted.text);
      size += formatted.text.length + 2;
      pagesRead++;
      links += formatted.links;
      if (size >= 30000) break;
    }
    const text = pages.join('\n\n').trim();
    if (!text)
      throw new Error(
        'No readable text found. Scanned PDFs need OCR or pasted résumé text. Your saved background was kept.',
      );
    return {
      text: text.slice(0, 30000),
      pagesRead,
      totalPages: document.numPages,
      truncated: text.length > 30000 || pagesRead < document.numPages,
      links,
    };
  } finally {
    await task.destroy();
  }
}
