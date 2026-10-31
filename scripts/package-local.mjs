import { cp, mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseInputs } from './release-inputs.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const built = join(root, 'dist/extension');
const destination = join(root, 'downloads');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(built, 'manifest.json'), 'utf8'));
if (
  manifest.name !== 'EZEapply' ||
  manifest.version !== pkg.version ||
  manifest.version_name !== `EZEapply ${pkg.version}`
) {
  throw new Error('Build the current EZEapply version before packaging.');
}
await mkdir(destination, { recursive: true });
const staging = await mkdtemp(join(root, '.local/package-'));
const files = [];
const allowed =
  /^(?:manifest\.json|LICENSE|THIRD-PARTY-NOTICES\.md|(?:sidepanel|options|popup|ai-settings|custom-fields|analytics)\.html|custom\/[^\0]+)$/;
async function inventory(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) await inventory(join(directory, entry.name), `${name}/`);
    else {
      if (
        !entry.isFile() ||
        !allowed.test(name) ||
        /(?:^|\/)(?:\.|fixtures|node_modules)|\.(?:map|pem|key|sqlite|db)$/.test(name)
      ) {
        throw new Error(`Unexpected release file: ${name}. Review it before packaging.`);
      }
      files.push(name);
    }
  }
}
try {
  await inventory(built);
  if (!files.includes('custom/libphonenumber-LICENSE') || !files.includes('custom/pdfjs-LICENSE')) {
    throw new Error('Required dependency notices are missing. Rebuild before packaging.');
  }
  const folder = join(staging, 'EZEapply');
  await mkdir(folder);
  const hashes = {};
  for (const file of files.sort()) {
    await mkdir(dirname(join(folder, file)), { recursive: true });
    await cp(join(built, file), join(folder, file));
    await utimes(join(folder, file), 946684800, 946684800);
    hashes[file] = createHash('sha256')
      .update(await readFile(join(folder, file)))
      .digest('hex');
  }
  const archive = join(destination, 'EZEapply.zip');
  await rm(archive, { force: true });
  await new Promise((resolve, reject) => {
    const zip = spawn('zip', ['-X', '-q', archive, ...files.map((file) => `EZEapply/${file}`)], {
      cwd: staging,
      stdio: 'inherit',
    });
    zip.on('error', reject);
    zip.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`zip exited ${code}`))));
  });
  const bytes = await readFile(archive);
  const digest = createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(destination, 'SHA256SUMS.txt'), `${digest}  EZEapply.zip\n`);
  await writeFile(
    join(destination, 'release-inventory.json'),
    JSON.stringify(
      {
        version: pkg.version,
        bytes: bytes.length,
        sha256: digest,
        files: hashes,
        sources: await releaseInputs(root),
        distribution: 'independent EZEapply runtime',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Installable ZIP: ${archive}\n${files.length} runtime files; SHA-256 ${digest}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
