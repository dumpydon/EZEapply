import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Compile our original entry points without requiring or redistributing an
// cached distribution. No bundle or browser data enters the repository.
await build({
  absWorkingDir: root,
  entryPoints: [
    'src/panel.ts',
    'src/content.ts',
    'src/background.ts',
    'src/app-ui.ts',
    'src/ai/settings.ts',
    'src/analytics.ts',
  ],
  outdir: '.local/source-check',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  write: false,
  logLevel: 'warning',
});
console.log('All EZEapply source entry points compile.');
