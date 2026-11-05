import { CV_MIME } from './cv-transfer';
import {
  readTray,
  updateTray,
  preparePDF,
  movePDF,
  dragPDF,
  MAX_PDFS,
  type TrayPDF,
} from './cv-tray-store';
function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') {
  const element = document.createElement(tag);
  element.className = cls;
  element.textContent = text;
  return element;
}
function button(text: string, label = text) {
  const element = node('button', 'cv-tool', text);
  element.type = 'button';
  element.title = label;
  element.setAttribute('aria-label', label);
  return element;
}
function icon(kind: 'download' | 'delete' | 'reorder') {
  const element = node('span', `cv-action-icon cv-icon-${kind}`);
  element.setAttribute('aria-hidden', 'true');
  return element;
}
export function mountCVTray(): { element: HTMLElement; dispose(): void } {
  const element = node('section', 'card cv-tray');
  const header = node('div', 'cv-header'),
    title = node('h2', '', 'Resume'),
    count = node('span', 'cv-count', '0 / 4'),
    add = button('+ Add PDF');
  const description = node('p', 'cv-description', 'Drag a PDF onto an upload area to drop it.');
  const grid = node('div', 'cv-grid'),
    status = node('p', 'cv-status');
  status.setAttribute('role', 'status');
  const picker = node('input', '');
  picker.type = 'file';
  picker.accept = '.pdf,application/pdf';
  picker.multiple = true;
  picker.hidden = true;
  header.append(title, count, description, add);
  element.append(header, grid, status, picker);
  let files: TrayPDF[] = [],
    disposed = false,
    busy = false,
    dragged = '',
    revision = 0;
  const urls: string[] = [];
  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('eze-cv-tray') : undefined;
  const revoke = () => {
    urls.splice(0).forEach((url) => URL.revokeObjectURL(url));
  };
  const errorText = (error: unknown) =>
    error instanceof Error ? error.message : 'Could not update your PDFs.';
  async function refresh() {
    const current = ++revision;
    try {
      const saved = await readTray();
      if (!disposed && current === revision) {
        files = saved;
        render();
      }
    } catch (error) {
      if (!disposed) status.textContent = errorText(error);
    }
  }
  async function change(update: (saved: TrayPDF[]) => TrayPDF[], message: string) {
    if (busy) return;
    busy = true;
    add.disabled = true;
    try {
      await updateTray(update);
      channel?.postMessage('changed');
      if (!disposed) {
        await refresh();
        status.textContent = message;
      }
    } catch (error) {
      if (!disposed) status.textContent = errorText(error);
    } finally {
      busy = false;
      if (!disposed) add.disabled = files.length >= MAX_PDFS;
    }
  }
  function render() {
    revoke();
    grid.replaceChildren();
    grid.style.setProperty('--cv-count', String(Math.max(1, files.length)));
    count.textContent = `${files.length} / 4`;
    add.disabled = busy || files.length >= MAX_PDFS;
    if (!files.length) {
      grid.append(node('div', 'cv-empty', 'Keep up to four application PDFs ready here.'));
      return;
    }
    files.forEach((pdf, index) => {
      const tile = node('article', 'cv-tile'),
        document = button('', `Drag ${pdf.name} to upload`);
      document.className = 'cv-document';
      tile.draggable = true;
      document.draggable = true;
      document.append(node('span', 'cv-paper', 'PDF'));
      const name = node('span', 'cv-name', pdf.name.replace(/\.pdf$/i, ''));
      name.title = pdf.name;
      const size = node('span', 'cv-size', `${Math.max(1, Math.round(pdf.blob.size / 1024))} KB`);
      const grip = button('', `Reorder ${pdf.name}. Use Left and Right arrow keys.`);
      grip.className = 'cv-action cv-grip';
      grip.append(icon('reorder'));
      const actions = node('div', 'cv-actions'),
        download = node('a', 'cv-action cv-download'),
        remove = button('', `Delete ${pdf.name}`);
      remove.className = 'cv-action cv-delete';
      download.title = `Download ${pdf.name}`;
      download.setAttribute('aria-label', download.title);
      download.draggable = false;
      download.append(icon('download'));
      remove.append(icon('delete'));
      const url = URL.createObjectURL(pdf.blob);
      urls.push(url);
      download.href = url;
      download.download = pdf.name;
      actions.append(grip, download, remove);
      // Download/delete must not start a file drag. The grip handles its own reorder drag.
      actions.addEventListener('dragstart', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      tile.addEventListener('dragstart', (event) => {
        if (event.dataTransfer) {
          dragPDF(event.dataTransfer, pdf);
          const token = crypto.randomUUID();
          event.dataTransfer.setData(CV_MIME, `eze-pdf:${token}`);
          event.dataTransfer.setData('text/plain', `eze-pdf:${token}`);
          void chrome.runtime
            .sendMessage({ type: 'eze-cv:begin', token, id: pdf.id })
            .then((result) => {
              if (result?.error && !disposed) status.textContent = result.error;
            })
            .catch(() => {
              if (!disposed)
                status.textContent = 'Refresh the extension and page, then drag again.';
            });
        }
      });
      document.addEventListener('click', () => {
        status.textContent =
          'Drag the PDF icon onto the form’s upload area. If a site rejects the drop, use the download button and its file picker.';
      });
      grip.draggable = true;
      grip.addEventListener('dragstart', (event) => {
        dragged = pdf.id;
        event.stopPropagation();
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('application/x-eze-cv-order', pdf.id);
        }
      });
      grip.addEventListener('dragend', () => {
        dragged = '';
      });
      tile.addEventListener('dragover', (event) => {
        if (dragged) {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        }
      });
      tile.addEventListener('drop', (event) => {
        if (!dragged) return;
        event.preventDefault();
        const id = dragged;
        dragged = '';
        void change((saved) => movePDF(saved, id, index), 'PDF order saved.');
      });
      grip.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const offset = event.key === 'ArrowLeft' ? -1 : 1;
        void change(
          (saved) => movePDF(saved, pdf.id, saved.findIndex((file) => file.id === pdf.id) + offset),
          'PDF order saved.',
        );
      });
      remove.addEventListener('click', () => {
        if (confirm(`Remove ${pdf.name} from your saved resumes? Your original file is kept.`))
          void change((saved) => saved.filter((file) => file.id !== pdf.id), 'PDF removed.');
      });
      tile.append(document, name, size, actions);
      grid.append(tile);
    });
  }
  add.addEventListener('click', () => picker.click());
  picker.addEventListener('change', async () => {
    const selected = Array.from(picker.files || []);
    picker.value = '';
    if (!selected.length || busy) return;
    try {
      if (selected.length + files.length > MAX_PDFS)
        throw new Error('Choose only enough PDFs to fill the four available slots.');
      const prepared = await Promise.all(selected.map(preparePDF));
      await change(
        (saved) => [...saved, ...prepared],
        `${prepared.length} PDF${prepared.length === 1 ? '' : 's'} added.`,
      );
    } catch (error) {
      status.textContent = errorText(error);
    }
  });
  if (channel)
    channel.onmessage = () => {
      void refresh();
    };
  void refresh();
  return {
    element,
    dispose() {
      disposed = true;
      revision++;
      revoke();
      channel?.close();
    },
  };
}
