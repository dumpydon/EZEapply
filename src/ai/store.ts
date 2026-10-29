import { defaults, type AISettings } from './config';

// Separate extension-origin IndexedDB. No keys in chrome.storage, sync, exports,
// page DOM, logs, or messages sent back to settings/content scripts.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('eze-ai-private', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Could not open local AI settings.'));
  });
}
export async function readAISettings(): Promise<AISettings> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('settings').objectStore('settings').get('current');
      request.onsuccess = () => resolve(request.result || defaults());
      request.onerror = () => reject(new Error('Could not read local AI settings.'));
    });
  } finally {
    db.close();
  }
}
let writes = Promise.resolve();
/** External readers wait for accepted settings edits already queued in this
 * worker. Internal write transactions still use readAISettings to avoid a cycle. */
export async function readCommittedAISettings(): Promise<AISettings> {
  await writes;
  return readAISettings();
}
export async function updateAISettings(
  change: (settings: AISettings) => AISettings | Promise<AISettings>,
): Promise<AISettings> {
  let result: AISettings;
  const task = writes.then(async () => {
    result = await change(await readAISettings());
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('settings', 'readwrite');
        tx.objectStore('settings').put(result, 'current');
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(new Error('Could not save local AI settings.'));
      });
    } finally {
      db.close();
    }
  });
  writes = task.catch(() => {});
  await task;
  return result!;
}
