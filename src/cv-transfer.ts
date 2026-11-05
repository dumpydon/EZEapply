import { deliverPDF } from './cv-drop-target';
import { readTray } from './cv-tray-store';
export const CV_MIME = 'application/x-eze-pdf';
const PREFIX = 'eze-pdf:';
export function installCVTransfer(): void {
  let grant: { token: string; id: string; tabId: number; expires: number } | undefined;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || !['eze-cv:begin', 'eze-cv:receive'].includes(message.type)) return;
    const work = async () => {
      if (message.type === 'eze-cv:begin') {
        if (
          sender.tab ||
          sender.id !== chrome.runtime.id ||
          sender.url !== chrome.runtime.getURL('sidepanel.html')
        )
          throw new Error('Open the side panel to drag a PDF.');
        if (
          typeof message.token !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(message.token) ||
          typeof message.id !== 'string'
        )
          throw new Error('Invalid PDF drag.');
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab?.id === undefined || !/^https?:/.test(tab.url || ''))
          throw new Error('Open a website before dragging a PDF.');
        grant = {
          token: message.token,
          id: message.id,
          tabId: tab.id,
          expires: Date.now() + 60000,
        };
        // Tabs open before this build may still have the old drop receiver.
        // The content bundle's startup guard prevents duplicate listeners.
        if (chrome.scripting?.executeScript) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: ['custom/content.js'],
          });
          await chrome.tabs
            .sendMessage(tab.id, { type: 'eze-cv:armed', token: message.token })
            .catch(() => {});
        }
        return { ok: true };
      }
      if (
        !grant ||
        grant.token !== message.token ||
        grant.expires < Date.now() ||
        sender.tab?.id !== grant.tabId ||
        !/^https?:/.test(sender.url || '')
      )
        throw new Error('This PDF drag expired. Please drag the tile again.');
      const id = grant.id;
      grant = undefined;
      const pdf = (await readTray()).find((file) => file.id === id);
      if (!pdf) throw new Error('The PDF is no longer in your tray.');
      const bytes = new Uint8Array(await pdf.blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { name: pdf.name, modified: pdf.modified, data: btoa(binary) };
    };
    void work().then(respond, (error) =>
      respond({ error: error instanceof Error ? error.message : 'PDF transfer failed.' }),
    );
    return true;
  });
}
export function pdfDragToken(data: DataTransfer): string {
  const raw = data.getData(CV_MIME) || data.getData('text/plain');
  return /^eze-pdf:[a-f0-9-]{36}$/.test(raw) ? raw.slice(PREFIX.length) : '';
}
export function mountCVFileDrop(): void {
  let armedUntil = 0;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== 'eze-cv:armed' || sender.id !== chrome.runtime.id) return;
    armedUntil = Date.now() + 60000;
    respond({ ok: true });
  });
  document.addEventListener(
    'dragover',
    (event) => {
      if (
        event.isTrusted &&
        event.dataTransfer &&
        (event.dataTransfer.types.includes(CV_MIME) ||
          (armedUntil > Date.now() && event.dataTransfer.types.includes('text/plain')))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.dataTransfer.dropEffect = 'copy';
      }
    },
    true,
  );
  document.addEventListener(
    'drop',
    (event) => {
      if (!event.isTrusted || !event.dataTransfer) return;
      const token = pdfDragToken(event.dataTransfer);
      if (!token) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const target = event.composedPath()[0];
      if (!(target instanceof Element)) return;
      void chrome.runtime
        .sendMessage({ type: 'eze-cv:receive', token })
        .then((result) => {
          if (result?.error || !result?.data)
            throw new Error(result?.error || 'Could not transfer PDF.');
          armedUntil = 0;
          const bytes = Uint8Array.from(atob(result.data), (char) => char.charCodeAt(0));
          deliverPDF(
            target,
            new File([bytes], result.name, {
              type: 'application/pdf',
              lastModified: result.modified,
            }),
          );
        })
        .catch((error) => {
          const notice = document.createElement('div');
          notice.setAttribute('role', 'alert');
          notice.textContent = `EZEapply: ${error.message} Use the tile’s Download PDF option if needed.`;
          Object.assign(notice.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '2147483647',
            background: '#20332c',
            color: 'white',
            padding: '16px',
            borderRadius: '10px',
            maxWidth: '360px',
            font: '14px system-ui',
          });
          document.documentElement.append(notice);
          setTimeout(() => notice.remove(), 8000);
        });
    },
    true,
  );
}
