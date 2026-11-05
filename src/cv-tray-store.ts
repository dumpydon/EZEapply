/** Deliberately separate from profile, reusable answers and AI context. */
export interface TrayPDF {
  id: string;
  name: string;
  blob: Blob;
  modified: number;
}
export const MAX_PDFS = 4;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('eze-cv-tray', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open your PDF tray.'));
  });
}
export async function readTray(): Promise<TrayPDF[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('files').objectStore('files').get('tray');
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(new Error('Could not read your PDFs.'));
    });
  } finally {
    db.close();
  }
}
export async function updateTray(change: (files: TrayPDF[]) => TrayPDF[]): Promise<TrayPDF[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite', { durability: 'strict' });
      const store = tx.objectStore('files');
      let result: TrayPDF[];
      let failure: unknown;
      const request = store.get('tray');
      request.onsuccess = () => {
        try {
          result = change(request.result || []);
          if (result.length > MAX_PDFS)
            throw new Error('Your tray holds up to four PDFs. Remove one before adding another.');
          store.put(result, 'tray');
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () =>
        reject(failure || new Error('Could not save your PDFs. Please try again.'));
    });
  } finally {
    db.close();
  }
}
export async function preparePDF(file: File): Promise<TrayPDF> {
  if (!/\.pdf$/i.test(file.name) || !file.size || file.size > MAX_PDF_BYTES)
    throw new Error('Choose a PDF between 1 byte and 20 MB.');
  const bytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if (!new TextDecoder().decode(bytes).includes('%PDF-'))
    throw new Error('This file does not contain a PDF header.');
  return {
    id: crypto.randomUUID(),
    name: file.name,
    blob: new Blob([file], { type: 'application/pdf' }),
    modified: file.lastModified,
  };
}
export function movePDF(files: TrayPDF[], id: string, target: number): TrayPDF[] {
  const index = files.findIndex((file) => file.id === id);
  if (index < 0) return files;
  const next = [...files];
  const [file] = next.splice(index, 1);
  next.splice(Math.max(0, Math.min(target, next.length)), 0, file);
  return next;
}
export function dragPDF(transfer: DataTransfer, pdf: TrayPDF): void {
  transfer.effectAllowed = 'copy';
  transfer.items.add(
    new File([pdf.blob], pdf.name, { type: 'application/pdf', lastModified: pdf.modified }),
  );
}
