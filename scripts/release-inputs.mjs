import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Tie the reviewed ZIP to every source and tool used to build it. */
export async function releaseInputs(root) {
  const names = [
    'package.json',
    'package-lock.json',
    'LICENSE',
    'THIRD-PARTY-NOTICES.md',
    'scripts/build.mjs',
    'scripts/build-output.mjs',
    'scripts/branding.mjs',
    'scripts/local-public-key.txt',
    'scripts/package-local.mjs',
    'scripts/release-inputs.mjs',
    'scripts/check-release.mjs',
  ];
  async function walk(prefix) {
    for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
      const name = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) names.push(name);
      else throw new Error(`Unexpected release input: ${name}`);
    }
  }
  await walk('src');
  const hashes = {};
  for (const name of names.sort()) hashes[name] = sha256(await readFile(join(root, name)));
  return hashes;
}
