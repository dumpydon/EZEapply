// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { mountCVTray } from '../src/cv-tray';
import type { TrayPDF } from '../src/cv-tray-store';
const state = vi.hoisted(() => ({ files: [] as TrayPDF[] }));
vi.mock('../src/cv-tray-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/cv-tray-store')>()),
  readTray: async () => state.files,
  updateTray: async (fn: (files: TrayPDF[]) => TrayPDF[]) => {
    state.files = fn(state.files);
    return state.files;
  },
}));
let dispose: () => void;
beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('chrome', {
    storage: { local: { set: vi.fn() } },
    runtime: { sendMessage: vi.fn(async () => ({ ok: true })) },
  });
  URL.createObjectURL = vi.fn(() => 'blob:synthetic');
  URL.revokeObjectURL = vi.fn();
  state.files = [];
});
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
it.each([1, 2, 3, 4])(
  'shows exactly %s tiles and never changes profile/answer storage',
  async (count) => {
    state.files = Array.from({ length: count }, (_, i) => ({
      id: String(i),
      name: `Resume ${i}.pdf`,
      blob: new Blob(['%PDF-']),
      modified: 1,
    }));
    const tray = mountCVTray();
    dispose = tray.dispose;
    document.body.append(tray.element);
    await vi.waitFor(() => expect(document.querySelectorAll('.cv-tile')).toHaveLength(count));
    expect(
      (document.querySelector('.cv-grid') as HTMLElement).style.getPropertyValue('--cv-count'),
    ).toBe(String(count));
    expect((document.querySelector('.cv-header button') as HTMLButtonElement).disabled).toBe(
      count === 4,
    );
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    const grip = document.querySelector<HTMLButtonElement>('.cv-grip')!;
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await vi.waitFor(() =>
      expect(document.querySelector('.cv-status')?.textContent).toBe('PDF order saved.'),
    );
    expect(state.files[Math.min(1, count - 1)].id).toBe('0');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  },
);
it('requires confirmation to remove a PDF and releases download URLs on dispose', async () => {
  state.files = [{ id: 'one', name: 'Resume.pdf', blob: new Blob(['%PDF-']), modified: 1 }];
  const tray = mountCVTray();
  dispose = tray.dispose;
  document.body.append(tray.element);
  await vi.waitFor(() => expect(document.querySelectorAll('.cv-tile')).toHaveLength(1));
  vi.stubGlobal('confirm', () => false);
  document.querySelector<HTMLButtonElement>('.cv-delete')!.click();
  expect(state.files).toHaveLength(1);
  vi.stubGlobal('confirm', () => true);
  document.querySelector<HTMLButtonElement>('.cv-delete')!.click();
  await vi.waitFor(() => expect(document.querySelectorAll('.cv-tile')).toHaveLength(0));
  expect(chrome.storage.local.set).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');
});
it('exposes direct file actions without starting a PDF drag from the toolbar', async () => {
  state.files = [{ id: 'one', name: 'Engineering CV.pdf', blob: new Blob(['%PDF-']), modified: 1 }];
  const tray = mountCVTray();
  dispose = tray.dispose;
  document.body.append(tray.element);
  await vi.waitFor(() => expect(document.querySelectorAll('.cv-tile')).toHaveLength(1));
  const download = document.querySelector<HTMLAnchorElement>('.cv-download')!;
  expect(download.download).toBe('Engineering CV.pdf');
  expect(download.href).toBe('blob:synthetic');
  expect(download.getAttribute('aria-label')).toBe('Download Engineering CV.pdf');
  expect(download.draggable).toBe(false);
  expect(document.querySelector('.cv-delete')?.getAttribute('aria-label')).toBe(
    'Delete Engineering CV.pdf',
  );
  expect(document.querySelector('details')).toBeNull();
  for (const action of document.querySelectorAll('.cv-download, .cv-delete')) {
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    action.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  }
  const reorder = new Event('dragstart', { bubbles: true, cancelable: true });
  const transfer = { setData: vi.fn(), effectAllowed: '' };
  Object.defineProperty(reorder, 'dataTransfer', { value: transfer });
  document.querySelector<HTMLButtonElement>('.cv-grip')!.dispatchEvent(reorder);
  expect(reorder.defaultPrevented).toBe(false);
  expect(transfer.setData).toHaveBeenCalledWith('application/x-eze-cv-order', 'one');
  expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
});
