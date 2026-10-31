import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseInputs, sha256 } from './release-inputs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const archive = join(root, 'downloads/EZEapply.zip');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const inventory = JSON.parse(
  await readFile(join(root, 'downloads/release-inventory.json'), 'utf8'),
);
function requireMatch(condition, message) {
  if (!condition) throw new Error(`${message} Run npm run package before publishing.`);
}
const bytes = await readFile(archive);
requireMatch(inventory.version === pkg.version, 'The download has an outdated version.');
requireMatch(bytes.length === inventory.bytes, 'The download size does not match its inventory.');
requireMatch(
  sha256(bytes) === inventory.sha256,
  'The download checksum does not match its inventory.',
);
requireMatch(
  (await readFile(join(root, 'downloads/SHA256SUMS.txt'), 'utf8')) ===
    `${inventory.sha256}  EZEapply.zip\n`,
  'The published checksum file does not match the download.',
);
const sources = await releaseInputs(root);
requireMatch(
  JSON.stringify(sources) === JSON.stringify(inventory.sources),
  'The download was not packaged from the current source files.',
);
const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n');
const expected = Object.keys(inventory.files).sort();
requireMatch(
  entries.length === expected.length &&
    JSON.stringify(entries.slice().sort()) ===
      JSON.stringify(expected.map((name) => `EZEapply/${name}`)),
  'The ZIP has missing, extra or duplicate files.',
);
for (const name of expected) {
  requireMatch(
    /^(?:manifest\.json|LICENSE|THIRD-PARTY-NOTICES\.md|(?:sidepanel|options|popup|ai-settings|custom-fields|analytics)\.html|custom\/.+)$/.test(
      name,
    ) && !/(?:^|\/)(?:\.|fixtures|node_modules)|\.(?:map|pem|key|sqlite|db)$/.test(name),
    `Unexpected release file: ${name}.`,
  );
  const content = execFileSync('unzip', ['-p', archive, `EZEapply/${name}`], {
    maxBuffer: 20 * 1024 * 1024,
  });
  requireMatch(sha256(content) === inventory.files[name], `ZIP content differs: ${name}.`);
}
const manifest = JSON.parse(
  execFileSync('unzip', ['-p', archive, 'EZEapply/manifest.json'], { encoding: 'utf8' }),
);
requireMatch(
  manifest.name === 'EZEapply' &&
    manifest.version === pkg.version &&
    manifest.version_name === `EZEapply ${pkg.version}` &&
    manifest.key === (await readFile(join(root, 'scripts/local-public-key.txt'), 'utf8')).trim(),
  'The ZIP has an unexpected extension version or identity.',
);
for (const name of [
  'custom/libphonenumber-LICENSE',
  'custom/pdfjs-LICENSE',
  'LICENSE',
  'THIRD-PARTY-NOTICES.md',
])
  requireMatch(expected.includes(name), `Missing required notice: ${name}.`);
console.log(
  `Verified EZEapply ${pkg.version}: ${expected.length} ZIP files, ${Object.keys(sources).length} source inputs, matching identity and SHA-256.`,
);
