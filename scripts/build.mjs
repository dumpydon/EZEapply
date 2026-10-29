import { build } from 'esbuild';
import { cp, mkdir, mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateBranding } from './branding.mjs';
import { publishBuild } from './build-output.mjs';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const key = (await readFile(join(root, 'scripts/local-public-key.txt'), 'utf8')).trim();
const id = createHash('sha256')
  .update(Buffer.from(key, 'base64'))
  .digest('hex')
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
await mkdir(join(root, '.local'), { recursive: true });
await mkdir(join(root, 'dist'), { recursive: true });
const out = await mkdtemp(join(root, '.local/extension-build-'));
const destination = join(root, 'dist/extension');
try {
  const icons = await generateBranding(out);
  const manifest = {
    manifest_version: 3,
    name: 'EZEapply',
    short_name: 'EZEapply',
    version: pkg.version,
    version_name: `EZEapply ${pkg.version}`,
    description:
      'Your application profile, reusable answers, smart form filling, your own AI provider, and application analytics.',
    author: 'Piyush Agarwal',
    minimum_chrome_version: '120',
    key,
    icons,
    permissions: [
      'storage',
      'unlimitedStorage',
      'clipboardWrite',
      'webNavigation',
      'scripting',
      'sidePanel',
    ],
    host_permissions: ['http://*/*', 'https://*/*'],
    background: { service_worker: 'custom/background.js' },
    action: { default_title: 'EZEapply', default_popup: 'popup.html', default_icon: icons },
    side_panel: { default_path: 'sidepanel.html' },
    options_ui: { page: 'options.html', open_in_tab: true },
    content_scripts: [
      {
        matches: ['http://*/*', 'https://*/*'],
        js: ['custom/content.js'],
        run_at: 'document_idle',
        all_frames: true,
        match_about_blank: true,
        match_origin_as_fallback: true,
      },
    ],
    web_accessible_resources: [
      {
        resources: ['custom/ai-logo.png', 'custom/icon/32.png'],
        matches: ['http://*/*', 'https://*/*'],
      },
    ],
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
  };
  const page = (title, styles, scripts, body) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EZEapply · ${title}</title><link rel="icon" href="custom/icon/32.png">${styles.map((name) => `<link rel="stylesheet" href="custom/${name}.css">`).join('')}${scripts.map((name) => `<script defer src="custom/${name}.js"></script>`).join('')}</head><body>${body}</body></html>\n`;
  const pages = {
    'popup.html': page('Quick Access', ['theme'], ['app-ui'], '<div id="root"></div>'),
    'options.html': page('Applications & profile', ['theme'], ['app-ui'], '<div id="root"></div>'),
    'sidepanel.html': page(
      'Your fields',
      ['theme', 'panel'],
      ['app-ui', 'panel'],
      '<div id="eze-custom-root"></div><div id="root"></div>',
    ),
    'custom-fields.html': page(
      'Your fields',
      ['theme', 'panel'],
      ['panel'],
      '<div id="eze-custom-root"></div>',
    ),
    'ai-settings.html': page(
      'AI settings',
      ['ai-settings'],
      ['ai-settings'],
      '<main id="eze-ai-settings" aria-label="EZEapply AI settings">Loading settings…</main>',
    ),
    'analytics.html': page(
      'Analytics',
      ['analytics'],
      ['analytics'],
      '<div id="eze-analytics" aria-label="EZEapply application analytics">Loading analytics…</div>',
    ),
  };
  for (const [file, html] of Object.entries(pages)) await writeFile(join(out, file), html);
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await build({
    entryPoints: {
      panel: join(root, 'src/panel.ts'),
      content: join(root, 'src/content.ts'),
      background: join(root, 'src/background.ts'),
      'app-ui': join(root, 'src/app-ui.ts'),
      'ai-settings': join(root, 'src/ai/settings.ts'),
      analytics: join(root, 'src/analytics.ts'),
    },
    outdir: join(out, 'custom'),
    bundle: true,
    format: 'iife',
    target: 'chrome120',
    sourcemap: process.argv.includes('--debug'),
    legalComments: 'none',
  });
  for (const [from, to] of [
    ['panel.css', 'panel.css'],
    ['theme.css', 'theme.css'],
    ['app-controls.css', 'app-controls.css'],
    ['ai/settings.css', 'ai-settings.css'],
    ['analytics.css', 'analytics.css'],
    ['assets/wordmark.svg', 'wordmark.svg'],
  ])
    await cp(join(root, 'src', from), join(out, 'custom', to));
  await sharp(join(root, 'src/assets/ai-logo.png'))
    .resize(192, 192, { fit: 'inside' })
    .png()
    .toFile(join(out, 'custom/ai-logo.png'));
  for (const name of ['pdf.mjs', 'pdf.worker.mjs'])
    await cp(join(root, 'node_modules/pdfjs-dist/build', name), join(out, 'custom', name));
  await cp(join(root, 'node_modules/pdfjs-dist/LICENSE'), join(out, 'custom/pdfjs-LICENSE'));
  await cp(
    join(root, 'node_modules/libphonenumber-js/LICENSE'),
    join(out, 'custom/libphonenumber-LICENSE'),
  );
  await cp(join(root, 'node_modules/pdfjs-dist/standard_fonts'), join(out, 'custom/pdf-fonts'), {
    recursive: true,
  });
  await cp(join(root, 'THIRD-PARTY-NOTICES.md'), join(out, 'THIRD-PARTY-NOTICES.md'));
  await cp(join(root, 'LICENSE'), join(out, 'LICENSE'));
  const hashes = {};
  async function inventory(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await inventory(join(directory, entry.name), `${name}/`);
      else
        hashes[name] = createHash('sha256')
          .update(await readFile(join(directory, entry.name)))
          .digest('hex');
    }
  }
  await inventory(out);
  await publishBuild(out, destination);
  await writeFile(
    join(root, '.local/build-info.json'),
    JSON.stringify(
      { version: pkg.version, extensionId: id, independent: true, files: hashes },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Built EZEapply ${pkg.version} from repository sources.\nExtension ID: ${id}\nLoad unpacked: ${destination}\n${Object.keys(hashes).length} runtime files; no cached extension required.`,
  );
} finally {
  await rm(out, { recursive: true, force: true });
}
