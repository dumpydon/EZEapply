export const PROVIDERS = [
  'cerebras',
  'openai',
  'anthropic',
  'gemini',
  'groq',
  'custom',
  'ollama',
  'minimax',
  'deepseek',
  'azure',
] as const;
export type Provider = (typeof PROVIDERS)[number];
export type Tier = 'fast' | 'smart';
export interface ModelChoice {
  id: string;
  label: string;
  uses: number;
  selectedAt: number;
}
export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  fast: string;
  smart: string;
  region: 'global' | 'china';
  workspace: string;
  entries: ModelChoice[];
  hidden: string[];
  catalog: { id: string; label: string }[];
  refreshedAt: number;
}
export interface AISettings {
  version: 1;
  provider: Provider;
  smart: boolean;
  includeProfile: boolean;
  length: 'short' | 'balanced' | 'detailed';
  maxCharacters: number;
  instructions: string;
  background: string;
  providers: Record<Provider, ProviderConfig>;
}
export type PublicSettings = Omit<AISettings, 'providers'> & {
  providers: Record<Provider, Omit<ProviderConfig, 'apiKey'> & { hasKey: boolean }>;
};
export const LABELS: Record<Provider, string> = {
  cerebras: 'Cerebras',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  groq: 'Groq',
  custom: 'Custom',
  ollama: 'Ollama',
  minimax: 'MiniMax',
  deepseek: 'DeepSeek',
  azure: 'Azure AI',
};
const DEFAULTS: Record<Provider, string[]> = {
  openai: [
    'gpt-6-luna',
    'gpt-6.1-sol',
    'gpt-6-astra',
    'gpt-6-sol',
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
  ],
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929'],
  gemini: ['gemini-3.8-flash', 'gemini-3.1-pro-preview'],
  cerebras: ['qwen-3.8-27b'],
  groq: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'],
  custom: [],
  ollama: ['llama3.2', 'llama3.3'],
  minimax: ['MiniMax-M2.7', 'MiniMax-M3'],
  deepseek: ['deepseek-flash', 'deepseek-v4-pro'],
  azure: [],
};
export function modelLabel(id: string): string {
  const match = /^gpt-(\d+(?:\.\d+)?)-(sol|luna|terra|astra)$/i.exec(id);
  return match ? `GPT-${match[1]} ${match[2][0].toUpperCase()}${match[2].slice(1)}` : id;
}
export function modelId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Enter a model ID.');
  const id = value.trim();
  if (!id || id.length > 240 || /[\s\x00-\x1f\x7f?#]/u.test(id))
    throw new Error('Enter a valid model ID without spaces.');
  return id;
}
export function isProvider(value: unknown): value is Provider {
  return PROVIDERS.includes(value as Provider);
}
export function defaults(): AISettings {
  return {
    version: 1,
    provider: 'openai',
    smart: false,
    includeProfile: true,
    length: 'short',
    maxCharacters: 900,
    instructions: '',
    background: '',
    providers: Object.fromEntries(
      PROVIDERS.map((provider) => [
        provider,
        {
          apiKey: '',
          baseUrl: provider === 'ollama' ? 'http://localhost:11434' : '',
          fast: DEFAULTS[provider][0] || '',
          smart: DEFAULTS[provider][1] || DEFAULTS[provider][0] || '',
          region: 'global',
          workspace: '',
          entries: [],
          hidden: [],
          catalog: DEFAULTS[provider].map((id) => ({ id, label: modelLabel(id) })),
          refreshedAt: 0,
        },
      ]),
    ) as unknown as AISettings['providers'],
  };
}
export function publicSettings(settings: AISettings): PublicSettings {
  return {
    ...settings,
    providers: Object.fromEntries(
      PROVIDERS.map((provider) => {
        const { apiKey, ...config } = settings.providers[provider];
        return [provider, { ...config, hasKey: !!apiKey }];
      }),
    ) as PublicSettings['providers'],
  };
}
export function normalizeEndpoint(raw: string, provider: Provider): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Enter a complete API URL.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    throw new Error('Use HTTPS, or HTTP on localhost for a local model.');
  if (url.username || url.password || url.search || url.hash)
    throw new Error('Keep credentials, query parameters and fragments out of the API URL.');
  if (
    provider === 'azure' &&
    !/(^|\.)(openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com|models\.ai\.azure\.com|inference\.ai\.azure\.com)$/i.test(
      url.hostname,
    )
  )
    throw new Error(
      'Enter your Azure AI or Azure OpenAI resource endpoint. Use Custom for another host.',
    );
  return url.toString().replace(/\/+$/, '');
}
/** Apply narrow UI mutations; content scripts never receive this secret-bearing object. */
export function editSettings(current: AISettings, action: Record<string, unknown>): AISettings {
  const next = structuredClone(current);
  const provider = action.provider;
  if (action.kind === 'general') {
    if (action.selectedProvider !== undefined) {
      if (!isProvider(action.selectedProvider)) throw new Error('Unknown provider.');
      next.provider = action.selectedProvider;
    }
    for (const key of ['smart', 'includeProfile'] as const)
      if (action[key] !== undefined) {
        if (typeof action[key] !== 'boolean') throw new Error('Invalid setting.');
        next[key] = action[key];
      }
    if (action.length !== undefined) {
      if (!['short', 'balanced', 'detailed'].includes(String(action.length)))
        throw new Error('Invalid length.');
      next.length = action.length as AISettings['length'];
    }
    if (action.maxCharacters !== undefined) {
      if (
        !Number.isInteger(action.maxCharacters) ||
        Number(action.maxCharacters) < 50 ||
        Number(action.maxCharacters) > 10000
      )
        throw new Error('Choose a character limit from 50 to 10,000.');
      next.maxCharacters = Number(action.maxCharacters);
    }
    for (const key of ['instructions', 'background'] as const)
      if (action[key] !== undefined) {
        if (
          typeof action[key] !== 'string' ||
          action[key].length > (key === 'background' ? 30000 : 4000)
        )
          throw new Error('This text is too long.');
        next[key] = action[key];
      }
    return next;
  }
  if (!isProvider(provider)) throw new Error('Unknown provider.');
  const config = next.providers[provider];
  if (action.kind === 'provider') {
    if (action.baseUrl !== undefined) {
      if (!['custom', 'azure', 'ollama'].includes(provider) || typeof action.baseUrl !== 'string')
        throw new Error('This provider has a fixed endpoint.');
      const url = action.baseUrl ? normalizeEndpoint(action.baseUrl, provider) : '';
      // Never silently send an existing credential to a newly selected host.
      if (url !== config.baseUrl && action.apiKey === undefined) config.apiKey = '';
      config.baseUrl = url;
      config.refreshedAt = 0;
    }
    if (action.apiKey !== undefined) {
      if (
        typeof action.apiKey !== 'string' ||
        action.apiKey.length > 8192 ||
        /[\r\n]/.test(action.apiKey)
      )
        throw new Error('Enter a valid API key.');
      config.apiKey = action.apiKey.trim();
      config.refreshedAt = 0;
    }
    if (action.region !== undefined) {
      if (!['global', 'china'].includes(String(action.region))) throw new Error('Invalid region.');
      if (action.region !== config.region) {
        config.apiKey = '';
        config.refreshedAt = 0;
      }
      config.region = action.region as ProviderConfig['region'];
    }
    if (action.workspace !== undefined) {
      if (
        typeof action.workspace !== 'string' ||
        action.workspace.length > 200 ||
        /[^a-zA-Z0-9_-]/.test(action.workspace)
      )
        throw new Error('Invalid workspace ID.');
      config.workspace = action.workspace;
    }
  } else if (action.kind === 'model') {
    const id = modelId(action.id);
    if (action.tier !== 'fast' && action.tier !== 'smart') throw new Error('Choose Fast or Smart.');
    config[action.tier] = id;
    const previous = config.entries.find((item) => item.id === id);
    config.entries = [
      { id, label: modelLabel(id), uses: previous?.uses || 0, selectedAt: Date.now() },
      ...config.entries.filter((item) => item.id !== id),
    ].slice(0, 100);
    config.hidden = config.hidden.filter((item) => item !== id);
  } else if (action.kind === 'hide-model') {
    const id = modelId(action.id);
    config.hidden = [...new Set([id, ...config.hidden])].slice(0, 500);
    config.entries = config.entries.filter((item) => item.id !== id);
  } else if (action.kind === 'restore-models') config.hidden = [];
  else throw new Error('Unknown settings action.');
  return next;
}
