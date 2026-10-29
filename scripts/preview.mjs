import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
// Exercise the complete production watcher on a synthetic localhost page.
// Only the test bundle substitutes the hostname; this is not in packaged code.
await build({
  entryPoints: [root + 'fixtures/linkedin-follow.ts'],
  outfile: root + '.local/linkedin-follow.js',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  plugins: [
    {
      name: 'preview-linkedin-host',
      setup(build) {
        build.onLoad({ filter: /src\/linkedin-follow\.ts$/ }, async (args) => ({
          contents: (await readFile(args.path, 'utf8')).replace(
            'isLinkedInHost(location.hostname)',
            "isLinkedInHost('www.linkedin.com')",
          ),
          loader: 'ts',
        }));
      },
    },
  ],
});
await build({
  entryPoints: [root + 'fixtures/ai-demo.ts'],
  outfile: root + '.local/ai-demo.js',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
});
await build({
  entryPoints: [root + 'fixtures/searchable-dropdown-preview.ts'],
  outfile: root + '.local/searchable-dropdown.js',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
});
await build({
  entryPoints: [root + 'fixtures/tracking-api.ts'],
  outfile: root + '.local/tracking-api.js',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
});
await build({
  entryPoints: [root + 'fixtures/submission-demo.ts'],
  outfile: root + '.local/submission-demo.js',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
});
await build({
  entryPoints: [root + 'fixtures/submission-complete.ts'],
  outfile: root + '.local/submission-complete.js',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
});
// The browser test tool cannot click closed shadow roots. The synthetic preview
// opens only our AI UI root; the packaged extension keeps it closed.
await build({
  entryPoints: [root + 'src/content.ts'],
  outfile: root + '.local/preview-content.js',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  plugins: [
    {
      name: 'preview-ai-root',
      setup(build) {
        build.onLoad({ filter: /ai\/field-ui\.ts$/ }, async (args) => ({
          contents: (await readFile(args.path, 'utf8')).replace(
            "attachShadow({ mode: 'closed' })",
            "attachShadow({ mode: 'open' })",
          ),
          loader: 'ts',
        }));
      },
    },
  ],
});
const nativeHtml = (await readFile(root + 'dist/extension/options.html', 'utf8')).replace(
  '<head>',
  '<head><script src="/native-api.js"></script><script src="/tracking-api.js"></script>',
);
const popupHtml = (await readFile(root + 'dist/extension/popup.html', 'utf8')).replace(
  '<head>',
  '<head><script src="/native-api.js"></script><script src="/tracking-api.js"></script>',
);
const sidepanelHtml = (await readFile(root + 'dist/extension/sidepanel.html', 'utf8')).replace(
  '<head>',
  '<head><script src="/native-api.js"></script><script src="/tracking-api.js"></script>',
);
const analyticsHtml = (await readFile(root + 'dist/extension/analytics.html', 'utf8')).replace(
  '<head>',
  '<head><script src="/native-api.js"></script><script src="/tracking-api.js"></script>',
);
const routes = {
  '/install.html': ['fixtures/install-film.html', 'text/html'],
  '/downloads/EZEapply.zip': ['downloads/EZEapply.zip', 'application/zip'],
  '/media/install-ezeapply.mp4': ['docs/media/install-ezeapply.mp4', 'video/mp4'],
  '/media/install-poster.png': ['docs/media/install-poster.png', 'image/png'],
  '/media/install-transcript.vtt': ['docs/media/install-transcript.vtt', 'text/vtt'],
  '/tracking-demo.html': ['fixtures/tracking-demo.html', 'text/html'],
  '/tracking-api.js': ['.local/tracking-api.js', 'text/javascript'],
  '/submission-demo.js': ['.local/submission-demo.js', 'text/javascript'],
  '/submission-complete.js': ['.local/submission-complete.js', 'text/javascript'],
  '/careers/apply/tracking-form': ['fixtures/tracking-form.html', 'text/html'],
  '/careers/apply/tracking-linkedin': ['fixtures/tracking-linkedin.html', 'text/html'],
  '/careers/apply/tracking-complete': ['fixtures/tracking-complete.html', 'text/html'],
  '/custom/analytics.js': ['dist/extension/custom/analytics.js', 'text/javascript'],
  '/custom/analytics.css': ['dist/extension/custom/analytics.css', 'text/css'],
  '/automatic-fill.html': ['fixtures/automatic-fill.html', 'text/html'],
  '/searchable-dropdown.html': ['fixtures/searchable-dropdown.html', 'text/html'],
  '/careers/apply/dropdown-form': ['fixtures/searchable-dropdown-form.html', 'text/html'],
  '/searchable-dropdown.js': ['.local/searchable-dropdown.js', 'text/javascript'],
  '/ai-scope.html': ['fixtures/ai-scope.html', 'text/html'],
  '/careers/apply/ai-scope': ['fixtures/ai-scope-application.html', 'text/html'],
  '/scope/conversation': ['fixtures/ai-scope-unrelated.html', 'text/html'],
  '/native-api.js': ['fixtures/native-api.js', 'text/javascript'],
  '/salary-format.html': ['fixtures/salary-format.html', 'text/html'],
  '/talent/all-opportunities': ['fixtures/salary-form.html', 'text/html'],
  '/linkedin-follow.html': ['fixtures/linkedin-follow.html', 'text/html'],
  '/linkedin-follow.js': ['.local/linkedin-follow.js', 'text/javascript'],
  '/ai-settings.html': ['fixtures/ai-settings.html', 'text/html'],
  '/custom/pdf.mjs': ['dist/extension/custom/pdf.mjs', 'text/javascript'],
  '/custom/pdf.worker.mjs': ['dist/extension/custom/pdf.worker.mjs', 'text/javascript'],
  '/ai-demo.js': ['.local/ai-demo.js', 'text/javascript'],
  '/custom/ai-settings.js': ['dist/extension/custom/ai-settings.js', 'text/javascript'],
  '/custom/ai-settings.css': ['dist/extension/custom/ai-settings.css', 'text/css'],
  '/custom/wordmark.svg': ['dist/extension/custom/wordmark.svg', 'image/svg+xml'],
  '/custom/ai-logo.png': ['dist/extension/custom/ai-logo.png', 'image/png'],
  '/': ['fixtures/preview.html', 'text/html'],
  '/panel.html': ['fixtures/panel.html', 'text/html'],
  '/compatibility.html': ['fixtures/compatibility.html', 'text/html'],
  '/apply/compatibility-form.html': ['fixtures/compatibility-form.html', 'text/html'],
  '/apply/compatibility-frame.html': ['fixtures/compatibility-frame.html', 'text/html'],
  '/compatibility.js': ['fixtures/compatibility.js', 'text/javascript'],
  '/apply/form.html': ['fixtures/form.html', 'text/html'],
  '/form.html': ['fixtures/form.html', 'text/html'],
  '/demo-api.js': ['fixtures/demo-api.js', 'text/javascript'],
  '/custom/panel.js': ['dist/extension/custom/panel.js', 'text/javascript'],
  '/custom/content.js': ['.local/preview-content.js', 'text/javascript'],
  '/custom/panel.css': ['dist/extension/custom/panel.css', 'text/css'],
  '/custom/theme.css': ['dist/extension/custom/theme.css', 'text/css'],
  '/custom/app-controls.css': ['dist/extension/custom/app-controls.css', 'text/css'],
  '/custom/app-ui.js': ['dist/extension/custom/app-ui.js', 'text/javascript'],
  '/custom/icon/128.png': ['dist/extension/custom/icon/128.png', 'image/png'],
  '/custom/icon/32.png': ['dist/extension/custom/icon/32.png', 'image/png'],
};
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/popup.html') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(popupHtml);
    return;
  }
  if (pathname === '/analytics.html') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(analyticsHtml);
    return;
  }
  if (pathname === '/sidepanel.html') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(sidepanelHtml);
    return;
  }
  if (pathname === '/native.html' || pathname === '/options.html') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end(nativeHtml);
    return;
  }
  const font = /^\/custom\/pdf-fonts\/[a-zA-Z0-9._-]+$/.test(pathname);
  const route =
    routes[pathname] ||
    (font ? ['dist/extension' + pathname, 'application/octet-stream'] : undefined);
  if (!route) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  try {
    res.writeHead(200, {
      'Content-Type': route[1],
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(await readFile(root + route[0]));
  } catch {
    res.writeHead(503);
    res.end('Build the extension first with npm run build.');
  }
});
server.listen(4317, '127.0.0.1', () =>
  console.log('Local test workspace: http://127.0.0.1:4317 — synthetic data only.'),
);
