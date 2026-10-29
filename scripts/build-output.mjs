import { mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Publish only a fully verified build. Retired files cannot survive by being
 * copied over an old output, and a failed swap preserves the previous build. */
export async function publishBuild(stagingDirectory, destination) {
  if (!(await stat(stagingDirectory)).isDirectory())
    throw new Error('Build staging is not a directory.');
  const backupRoot = await mkdtemp(join(dirname(destination), '.eze-build-backup-'));
  const backup = join(backupRoot, 'previous');
  let previous = false;
  let published = false;
  try {
    try {
      await rename(destination, backup);
      previous = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await rename(stagingDirectory, destination);
      published = true;
    } catch (error) {
      if (previous) {
        await rename(backup, destination);
        previous = false;
      }
      throw error;
    }
  } finally {
    // If the OS refuses both publication and rollback, keep the old directory
    // recoverable instead of deleting it in a cleanup handler.
    if (published || !previous) await rm(backupRoot, { recursive: true, force: true });
  }
}
