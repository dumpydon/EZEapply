import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  preparePDF,
  readTray,
  updateTray,
  movePDF,
  dragPDF,
  MAX_PDF_BYTES,
} from '../src/cv-tray-store';
const pdf = (name = 'Resume.pdf') =>
  new File(['%PDF-1.7\nresume bytes\n%%EOF'], name, { type: 'application/pdf', lastModified: 123 });
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
describe('independent CV tray', () => {
  it('persists original bytes and names across reopening and reordering', async () => {
    const first = await preparePDF(pdf()),
      second = await preparePDF(pdf('Second.pdf'));
    await updateTray(() => [first, second]);
    await updateTray((saved) => movePDF(saved, second.id, 0));
    const restored = await readTray();
    expect(restored.map((file) => file.name)).toEqual(['Second.pdf', 'Resume.pdf']);
    expect(await restored[1].blob.text()).toBe(await pdf().text());
    expect(restored[1].modified).toBe(123);
  });
  it('rejects non-PDF, empty and oversized uploads', async () => {
    for (const file of [
      new File(['hello'], 'fake.pdf'),
      new File(['%PDF-'], 'a.txt'),
      new File([], 'empty.pdf'),
      new File([new Uint8Array(MAX_PDF_BYTES + 1)], 'big.pdf'),
    ])
      await expect(preparePDF(file)).rejects.toThrow();
  });
  it('enforces the limit atomically even for concurrent writes', async () => {
    const files = await Promise.all(
      Array.from({ length: 5 }, (_, i) => preparePDF(pdf(`${i}.pdf`))),
    );
    const results = await Promise.allSettled(
      files.map((file) => updateTray((saved) => [...saved, file])),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(4);
    expect(await readTray()).toHaveLength(4);
  });
  it('removes only the selected tray file and preserves the others', async () => {
    const files = await Promise.all([preparePDF(pdf()), preparePDF(pdf('Other.pdf'))]);
    await updateTray(() => files);
    await updateTray((saved) => saved.filter((file) => file.id !== files[0].id));
    expect((await readTray()).map((file) => file.name)).toEqual(['Other.pdf']);
  });
  it('puts a real PDF File into the drag payload without a profile or answer payload', async () => {
    const saved = await preparePDF(pdf());
    const items: File[] = [];
    const transfer = { effectAllowed: '', items: { add: (file: File) => items.push(file) } };
    dragPDF(transfer as unknown as DataTransfer, saved);
    expect(transfer.effectAllowed).toBe('copy');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Resume.pdf');
    expect(items[0].type).toBe('application/pdf');
    expect(await items[0].text()).toBe(await pdf().text());
  });
});
