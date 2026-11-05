import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { installCVTransfer, pdfDragToken, CV_MIME } from '../src/cv-transfer';
import { preparePDF, updateTray } from '../src/cv-tray-store';
let listener: Parameters<typeof chrome.runtime.onMessage.addListener>[0];
const token = '12345678-1234-1234-1234-123456789abc';
const panel = { id: 'extension', url: 'chrome-extension://extension/sidepanel.html' };
const page = { id: 'extension', url: 'https://jobs.example.test/apply', tab: { id: 5 } };
const send = (message: unknown, sender: object) =>
  new Promise<any>((resolve) => listener(message, sender as chrome.runtime.MessageSender, resolve));
let id: string;
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'extension',
      getURL: (p: string) => `chrome-extension://extension/${p}`,
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
      },
    },
    tabs: { query: async () => [{ id: 5, url: 'https://jobs.example.test/apply' }] },
  });
  installCVTransfer();
  const pdf = await preparePDF(new File(['%PDF-1.4\nprivate synthetic CV'], 'Example.pdf'));
  id = pdf.id;
  await updateTray(() => [pdf]);
});
afterEach(() => vi.unstubAllGlobals());
it('hands off only the dragged PDF once to the authorized tab', async () => {
  expect(await send({ type: 'eze-cv:begin', token, id }, panel)).toEqual({ ok: true });
  const result = await send({ type: 'eze-cv:receive', token }, page);
  expect(result.name).toBe('Example.pdf');
  expect(atob(result.data)).toContain('private synthetic CV');
  expect((await send({ type: 'eze-cv:receive', token }, page)).error).toContain('expired');
});
it('rejects page-created grants, wrong tabs, guessed tokens and expired drags', async () => {
  expect((await send({ type: 'eze-cv:begin', token, id }, page)).error).toBeTruthy();
  await send({ type: 'eze-cv:begin', token, id }, panel);
  expect(
    (await send({ type: 'eze-cv:receive', token }, { ...page, tab: { id: 6 } })).error,
  ).toBeTruthy();
  expect((await send({ type: 'eze-cv:receive', token: 'wrong' }, page)).error).toBeTruthy();
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000);
  expect((await send({ type: 'eze-cv:receive', token }, page)).error).toBeTruthy();
  now.mockRestore();
});
it('reads only a well-formed EZE drag token', () => {
  expect(
    pdfDragToken({
      getData: (type: string) => (type === CV_MIME ? `eze-pdf:${token}` : ''),
    } as DataTransfer),
  ).toBe(token);
  expect(pdfDragToken({ getData: () => '/a/private/path.pdf' } as unknown as DataTransfer)).toBe(
    '',
  );
});
