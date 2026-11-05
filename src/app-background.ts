import { normalizeProfile } from './app-profile';
import { APPEARANCE_KEY, isColorThemeId } from './appearance-config';
import { DEFAULT_YES_KEY } from './types';

function trusted(sender: chrome.runtime.MessageSender): boolean {
  return !!sender.url && sender.url.startsWith(chrome.runtime.getURL(''));
}
export function installAppBackground(): void {
  let stageWrites = Promise.resolve();
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('eze-app:'))
      return;
    const work = async () => {
      if (!trusted(sender)) throw new Error('Open EZEapply to change its profile or preferences.');
      if (message.type === 'eze-app:default-yes') {
        if (typeof message.enabled !== 'boolean')
          throw new Error('Choose whether to default Yes/No questions to Yes.');
        await chrome.storage.local.set({ [DEFAULT_YES_KEY]: message.enabled });
        return { ok: true };
      }
      if (message.type === 'eze-app:appearance') {
        if (!isColorThemeId(message.theme))
          throw new Error('Choose one of the available color themes.');
        await chrome.storage.local.set({ [APPEARANCE_KEY]: message.theme });
        return { ok: true };
      }
      if (message.type === 'eze-app:save-profile') {
        const profile = normalizeProfile(message.profile);
        await chrome.storage.local.set({ profile });
        return { ok: true };
      }
      if (message.type === 'eze-app:autofill') {
        if (typeof message.enabled !== 'boolean')
          throw new Error('Choose whether autofill is enabled.');
        await chrome.storage.local.set({ autofillEnabled: message.enabled });
        return { ok: true };
      }
      if (message.type === 'eze-app:stage') {
        if (
          typeof message.id !== 'string' ||
          !message.id ||
          message.id.length > 200 ||
          !['Applied', 'Interview', 'Offer', 'Rejected'].includes(message.stage)
        )
          throw new Error('Choose a valid application stage.');
        const task = stageWrites.then(async () => {
          const data = await chrome.storage.local.get('eze.applicationStages.v1');
          const old = data['eze.applicationStages.v1'];
          const stages = old && typeof old === 'object' && !Array.isArray(old) ? old : {};
          await chrome.storage.local.set({
            'eze.applicationStages.v1': { ...stages, [message.id]: message.stage },
          });
        });
        stageWrites = task.catch(() => {});
        await task;
        return { ok: true };
      }
      throw new Error('Unknown EZEapply action.');
    };
    void work().then(respond, (error) =>
      respond({ error: error instanceof Error ? error.message : 'Could not save this change.' }),
    );
    return true;
  });
}
