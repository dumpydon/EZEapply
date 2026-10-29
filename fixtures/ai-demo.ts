// Synthetic preview adapter only; excluded from extension output. Never use a
// real key here. No request in this fixture contacts an AI provider.
import {
  defaults,
  editSettings,
  publicSettings,
  type AISettings,
  type Provider,
} from '../src/ai/config';
import { answerLimits, validateDraftRequest } from '../src/ai/generation';
const w = window as any;
let settings: AISettings = defaults();
settings.providers.openai.apiKey = 'preview-placeholder-only';
settings.providers.openai.entries = [
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', uses: 4, selectedAt: Date.now() },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', uses: 2, selectedAt: Date.now() },
];
const demoKey = 'eze-ai-synthetic-preview-v1';
function restore() {
  try {
    const saved = localStorage.getItem(demoKey);
    if (saved) settings = JSON.parse(saved);
    for (const config of Object.values(settings.providers))
      config.apiKey = config.apiKey ? 'preview-placeholder-only' : '';
  } catch {
    settings = defaults();
  }
}
restore();
const persist = () => localStorage.setItem(demoKey, JSON.stringify(settings));
let cancelled = new Set<string>();
const previous = w.chrome?.runtime?.sendMessage;
w.chrome ||= {};
w.chrome.runtime ||= {};
Object.assign(w.chrome.runtime, {
  id: 'local-test-only',
  getURL: (path: string) => '/' + path.replace(/^\//, ''),
  connect: () => ({ postMessage() {}, disconnect() {} }),
  async sendMessage(message: any) {
    restore();
    if (message.type === 'eze-ai:settings') return { settings: publicSettings(settings) };
    if (message.type === 'eze-ai:edit') {
      try {
        settings = editSettings(settings, {
          ...message.action,
          ...(message.action.apiKey ? { apiKey: 'preview-placeholder-only' } : {}),
        });
        persist();
        return { settings: publicSettings(settings) };
      } catch (error) {
        return { error: (error as Error).message };
      }
    }
    if (message.type === 'eze-ai:models') {
      const provider = message.provider as Provider;
      settings.providers[provider].refreshedAt = Date.now();
      return {
        settings: publicSettings(settings),
        live: false,
        message: 'Preview catalog · no provider request was made.',
      };
    }
    if (message.type === 'eze-ai:status')
      return {
        provider: settings.provider,
        model: settings.providers[settings.provider][message.tier === 'smart' ? 'smart' : 'fast'],
        configured: true,
        smart: settings.smart,
        hasBackground: !!settings.background.trim(),
        backgroundCharacters: settings.background.trim().length,
        includeProfile: settings.includeProfile,
      };
    if (message.type === 'eze-ai:open-settings') {
      window.open('/ai-settings.html', '_blank');
      return { ok: true };
    }
    if (message.type === 'eze-ai:cancel') {
      cancelled.add(message.id);
      return { ok: true };
    }
    if (message.type === 'eze-ai:generate') {
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (cancelled.has(message.id)) return { error: 'Generation cancelled.' };
      return {
        draft: {
          answer: 'I enjoy building useful software and solving practical problems with a team.',
          needsInfo: '',
          provider: 'Preview',
          model: 'synthetic-response',
          ...answerLimits(validateDraftRequest(message.request), settings),
          warning: '',
        },
      };
    }
    return previous ? previous(message) : { ok: true };
  },
});
w.chrome.storage ||= {
  local: {
    get: async () => ({
      profile: {
        resumeData: {
          resumeBase64:
            'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggMTAzID4+CnN0cmVhbQpCVCAvRjEgMTQgVGYgNzIgNzUwIFRkIChBbGV4IEV4YW1wbGUpIFRqIDAgLTI0IFRkIChTb2Z0d2FyZSBlbmdpbmVlciB3aXRoIFR5cGVTY3JpcHQgYW5kIFB5dGhvbi4pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjQxIDAwMDAwIG4gCjAwMDAwMDAzMTEgMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSA2IC9Sb290IDEgMCBSID4+CnN0YXJ0eHJlZgo0NjUKJSVFT0YK',
        },
      },
    }),
  },
};
