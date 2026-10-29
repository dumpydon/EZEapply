// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error JavaScript build tooling deliberately runs without ts-node.
import { publishBuild } from '../scripts/build-output.mjs';
let directory = '';
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});
describe('verified build publication', () => {
  it('replaces the output instead of preserving stale retired files', async () => {
    directory = await mkdtemp(join(tmpdir(), 'eze-output-test-'));
    const staging = join(directory, 'staging'),
      output = join(directory, 'extension');
    await mkdir(staging);
    await mkdir(output);
    await writeFile(join(output, 'retired.js'), 'old');
    await writeFile(join(staging, 'manifest.json'), 'new');
    await publishBuild(staging, output);
    expect(await readdir(output)).toEqual(['manifest.json']);
    expect(await readFile(join(output, 'manifest.json'), 'utf8')).toBe('new');
    expect(await readdir(directory)).toEqual(['extension']);
  });
  it('keeps the usable previous build when the staging directory is missing', async () => {
    directory = await mkdtemp(join(tmpdir(), 'eze-output-test-'));
    const output = join(directory, 'extension');
    await mkdir(output);
    await writeFile(join(output, 'manifest.json'), 'working');
    await expect(publishBuild(join(directory, 'missing'), output)).rejects.toThrow();
    expect(await readFile(join(output, 'manifest.json'), 'utf8')).toBe('working');
  });
});
