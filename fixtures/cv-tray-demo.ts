import { preparePDF, updateTray } from '../src/cv-tray-store';
document.getElementById('sample')!.addEventListener('click', async () => {
  const names = ['Engineering', 'Research', 'Backend', 'General'];
  const files = await Promise.all(
    names.map((name) =>
      preparePDF(
        new File(['%PDF-1.4\nSynthetic CV test\n%%EOF'], `${name}.pdf`, {
          type: 'application/pdf',
        }),
      ),
    ),
  );
  await updateTray(() => files);
  const channel = new BroadcastChannel('eze-cv-tray');
  channel.postMessage('changed');
  channel.close();
});
