import {
  editSettings,
  isProvider,
  LABELS,
  modelLabel,
  publicSettings,
  type Provider,
} from './config';
import { readCommittedAISettings as readAISettings, updateAISettings } from './store';
import { listModels } from './providers';
import { applicantFacts } from './facts';
import { generateDraft, validateDraftRequest } from './generation';
import { STORAGE_KEY } from '../types';

export function trustedSettingsSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    return (
      url.protocol === 'chrome-extension:' &&
      url.hostname === chrome.runtime.id &&
      [
        '/ai-settings.html',
        '/sidepanel.html',
        '/options.html',
        '/popup.html',
        '/custom-fields.html',
      ].includes(url.pathname)
    );
  } catch {
    return false;
  }
}
function webpageSender(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id &&
    Number.isInteger(sender.tab?.id) &&
    /^https?:\/\//.test(sender.url || '')
  );
}
const jobs = new Map<string, { controller: AbortController; tab: number }>();
const modelRequests = new Map<Provider, Promise<unknown>>();
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'AI request failed. Try again.';
}
async function refresh(provider: Provider, force: boolean) {
  const pending = modelRequests.get(provider);
  if (pending) return pending;
  const request = (async () => {
    const settings = await readAISettings(),
      config = settings.providers[provider];
    if (!force && config.refreshedAt > Date.now() - 5 * 60_000)
      return { settings: publicSettings(settings), live: true };
    try {
      const catalog = await listModels(provider, config);
      const next = await updateAISettings((current) => {
        const latest = current.providers[provider];
        // An old response cannot replace choices for a different key/endpoint.
        if (
          latest.apiKey !== config.apiKey ||
          latest.baseUrl !== config.baseUrl ||
          latest.region !== config.region ||
          latest.workspace !== config.workspace
        )
          return current;
        latest.catalog = catalog;
        latest.refreshedAt = Date.now();
        return current;
      });
      return {
        settings: publicSettings(next),
        live: true,
        message: catalog.length
          ? `Found ${catalog.length} available models.`
          : 'No compatible models were listed. Enter a model ID manually.',
      };
    } catch (error) {
      return {
        settings: publicSettings(await readAISettings()),
        live: false,
        message: `${errorText(error)} Saved choices remain available.`,
      };
    }
  })();
  modelRequests.set(provider, request);
  try {
    return await request;
  } finally {
    if (modelRequests.get(provider) === request) modelRequests.delete(provider);
  }
}
export function installAIBackground(): void {
  chrome.tabs.onRemoved.addListener((tab) => {
    for (const job of jobs.values()) if (job.tab === tab) job.controller.abort();
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || typeof message.type !== 'string' || !message.type.startsWith('eze-ai:')) return;
    const settingsSender = trustedSettingsSender(sender),
      pageSender = webpageSender(sender);
    const type = message.type;
    if (!settingsSender && !pageSender) {
      respond({ error: 'This request is not from EZEapply.' });
      return;
    }
    const work = async () => {
      if (type === 'eze-ai:open-settings') {
        await chrome.tabs.create({ url: chrome.runtime.getURL('ai-settings.html') });
        return { ok: true };
      }
      if (type === 'eze-ai:status') {
        const settings = await readAISettings();
        const config = settings.providers[settings.provider];
        const tier: 'fast' | 'smart' =
          message.tier === 'fast' || message.tier === 'smart'
            ? message.tier
            : settings.smart
              ? 'smart'
              : 'fast';
        const model = config[tier];
        const issue =
          ['custom', 'azure', 'ollama'].includes(settings.provider) && !config.baseUrl
            ? `Set your ${LABELS[settings.provider]} endpoint in AI settings.`
            : !['custom', 'ollama'].includes(settings.provider) && !config.apiKey
              ? `Add your ${LABELS[settings.provider]} API key in AI settings.`
              : !model
                ? 'Choose a model in AI settings.'
                : '';
        return {
          provider: settings.provider,
          smart: settings.smart,
          model,
          configured: !issue,
          issue,
          hasBackground: !!settings.background.trim(),
          backgroundCharacters: settings.background.trim().length,
          includeProfile: settings.includeProfile,
        };
      }
      if (type === 'eze-ai:generate' || type === 'eze-ai:cancel') {
        if (!pageSender) throw new Error('Open an application field to generate an answer.');
        if (typeof message.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(message.id))
          throw new Error('Invalid request ID.');
        const key = `${sender.tab!.id}:${sender.frameId || 0}:${message.id}`;
        if (type === 'eze-ai:cancel') {
          jobs.get(key)?.controller.abort();
          return { ok: true };
        }
        if (jobs.has(key)) throw new Error('This answer is already generating.');
        if (jobs.size >= 3 || [...jobs.values()].some((job) => job.tab === sender.tab!.id))
          throw new Error('Wait for the current answer or cancel it first.');
        const request = validateDraftRequest(message.request);
        const controller = new AbortController();
        jobs.set(key, { controller, tab: sender.tab!.id! });
        // Port traffic keeps an MV3 worker alive while a provider is generating.
        // Cancellation is explicit; no retry silently adds another paid request.
        try {
          const settings = await readAISettings();
          const data = settings.includeProfile
            ? await chrome.storage.local.get(['profile', 'lastSyncProfile', STORAGE_KEY])
            : {};
          const facts = settings.includeProfile
            ? applicantFacts(data, new URL(sender.url!).hostname)
            : {};
          const draft = await generateDraft(settings, request, facts, controller.signal);
          if (controller.signal.aborted) throw new Error('Generation cancelled.');
          await updateAISettings((current) => {
            const config = current.providers[settings.provider];
            if (!config.hidden.includes(draft.model)) {
              const previous = config.entries.find((entry) => entry.id === draft.model);
              config.entries = [
                {
                  id: draft.model,
                  label: modelLabel(draft.model),
                  uses: (previous?.uses || 0) + 1,
                  selectedAt: Date.now(),
                },
                ...config.entries.filter((entry) => entry.id !== draft.model),
              ].slice(0, 100);
            }
            return current;
          });
          return { draft };
        } finally {
          jobs.delete(key);
        }
      }
      if (!settingsSender) throw new Error('Open AI settings to manage providers and keys.');
      if (type === 'eze-ai:settings') return { settings: publicSettings(await readAISettings()) };
      if (type === 'eze-ai:edit')
        return {
          settings: publicSettings(
            await updateAISettings((current) => editSettings(current, message.action || {})),
          ),
        };
      if (type === 'eze-ai:models') {
        if (!isProvider(message.provider)) throw new Error('Unknown provider.');
        return refresh(message.provider, message.force === true);
      }
      throw new Error('Unknown AI action.');
    };
    void work().then(respond, (error) => respond({ error: errorText(error) }));
    return true;
  });
  chrome.runtime.onConnect?.addListener((port) => {
    if (port.name !== 'eze-ai:keepalive' || !port.sender || !webpageSender(port.sender)) return;
    let requestKey = '';
    port.onMessage.addListener((message) => {
      if (typeof message?.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(message.id))
        requestKey = `${port.sender!.tab!.id}:${port.sender!.frameId || 0}:${message.id}`;
      try {
        port.postMessage({ alive: true });
      } catch {
        /* Already closed. */
      }
    });
    port.onDisconnect.addListener(() => {
      if (requestKey) jobs.get(requestKey)?.controller.abort();
    });
  });
}
