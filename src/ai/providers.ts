import {
  LABELS,
  modelLabel,
  normalizeEndpoint,
  type Provider,
  type ProviderConfig,
} from './config';

type Fetch = typeof fetch;
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object) : [];
}
function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
interface Connection {
  base: string;
  headers: Record<string, string>;
  protocol: 'responses' | 'messages' | 'gemini' | 'ollama' | 'chat';
}
function connection(provider: Provider, config: ProviderConfig): Connection {
  const endpoints: Partial<Record<Provider, string>> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta',
    cerebras: 'https://api.cerebras.ai/v1',
    groq: 'https://api.groq.com/openai/v1',
    deepseek: 'https://api.deepseek.com',
    minimax:
      config.region === 'china' ? 'https://api.minimaxi.com/v1' : 'https://api.minimax.io/v1',
  };
  if (!config.apiKey && provider !== 'ollama' && provider !== 'custom')
    throw new Error(`Add your ${LABELS[provider]} API key in AI settings.`);
  let base = endpoints[provider] || normalizeEndpoint(config.baseUrl, provider);
  if (provider === 'azure') {
    base = base.replace(/\/(?:openai(?:\/v1)?|chat\/completions)\/?$/, '');
    base += '/openai/v1';
  }
  if (provider === 'custom') base = base.replace(/\/(?:chat\/completions|responses)\/?$/, '');
  if (provider === 'ollama') base = base.replace(/\/(?:api|v1)$/, '');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider === 'anthropic') {
    headers['x-api-key'] = config.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    if (config.workspace) headers['anthropic-workspace-id'] = config.workspace;
  } else if (provider === 'gemini') headers['x-goog-api-key'] = config.apiKey;
  else if (provider === 'azure') headers['api-key'] = config.apiKey;
  else if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  return {
    base,
    headers,
    protocol:
      provider === 'openai'
        ? 'responses'
        : provider === 'anthropic'
          ? 'messages'
          : provider === 'gemini'
            ? 'gemini'
            : provider === 'ollama'
              ? 'ollama'
              : 'chat',
  };
}
export function providerError(status: number, provider: Provider): Error {
  const name = LABELS[provider];
  if (status === 401) return new Error(`${name} rejected the API key. Update it in AI settings.`);
  if (status === 403)
    return new Error(
      `${name} denied access. Check your key permissions, workspace and model access.`,
    );
  if (status === 429)
    return new Error(
      `${name} reached a rate or billing limit. Check your provider account and retry later.`,
    );
  if (status === 404)
    return new Error(
      `${name} could not find this model or endpoint. Refresh models or enter the correct model/deployment ID.`,
    );
  if (status === 400 || status === 422)
    return new Error(
      `${name} rejected the request. Check that the selected model supports text generation and that the endpoint is correct.`,
    );
  return new Error(`${name} request failed (${status}). Try again later.`);
}
async function request(
  url: string,
  provider: Provider,
  headers: Record<string, string>,
  body: unknown,
  signal?: AbortSignal,
  fetcher: Fetch = fetch,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(body === undefined ? 15000 : 60000);
  try {
    const response = await fetcher(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw providerError(response.status, provider);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error(`${LABELS[provider]} returned an empty response.`);
    const decoder = new TextDecoder();
    let text = '',
      bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) {
        await reader.cancel();
        throw new Error('The provider response was too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${LABELS[provider]} returned an unreadable response.`);
    }
  } catch (error) {
    if (signal?.aborted) throw new Error('Generation cancelled.');
    if (timeout.aborted)
      throw new Error(`${LABELS[provider]} timed out. Retry or choose a faster model.`);
    // Network errors may contain URLs or credentials echoed by a custom server.
    if (error instanceof TypeError)
      throw new Error(`Could not reach ${LABELS[provider]}. Check your endpoint and connection.`);
    throw error;
  }
}
export async function complete(
  provider: Provider,
  config: ProviderConfig,
  model: string,
  system: string,
  prompt: string,
  signal?: AbortSignal,
  fetcher: Fetch = fetch,
): Promise<string> {
  const { base, headers, protocol } = connection(provider, config);
  let path: string, body: unknown;
  if (protocol === 'responses') {
    path = '/responses';
    body = { model, instructions: system, input: prompt, store: false, max_output_tokens: 6000 };
  } else if (protocol === 'messages') {
    path = '/messages';
    body = { model, system, messages: [{ role: 'user', content: prompt }], max_tokens: 3000 };
  } else if (protocol === 'gemini') {
    path = `/models/${encodeURIComponent(model.replace(/^models\//, ''))}:generateContent`;
    body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 6000, responseMimeType: 'application/json' },
    };
  } else if (protocol === 'ollama') {
    path = '/api/chat';
    body = {
      model,
      stream: false,
      format: 'json',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      options: { num_predict: 3000 },
    };
  } else {
    path = '/chat/completions';
    const tokenLimit = /^(?:gpt-[56]|o[134])(?:[.-]|$)/.test(model)
      ? { max_completion_tokens: 6000 }
      : { max_tokens: 3000 };
    body = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      stream: false,
      ...tokenLimit,
    };
  }
  const data = object(await request(base + path, provider, headers, body, signal, fetcher));
  let text = '';
  if (protocol === 'responses') {
    if (data.status === 'incomplete')
      throw new Error('The model stopped before completing the answer. Try a faster model.');
    text = objects(data.output)
      .flatMap((item) => (item.type === 'message' ? objects(item.content) : []))
      .filter((item) => item.type === 'output_text')
      .map((item) => string(item.text))
      .join('');
  } else if (protocol === 'messages')
    text = objects(data.content)
      .filter((item) => item.type === 'text')
      .map((item) => string(item.text))
      .join('');
  else if (protocol === 'gemini')
    text = objects(object(objects(data.candidates)[0]?.content).parts)
      .filter((item) => !item.thought)
      .map((item) => string(item.text))
      .join('');
  else if (protocol === 'ollama') text = string(object(data.message).content);
  else text = string(object(objects(data.choices)[0]?.message).content);
  if (!text.trim())
    throw new Error('The model returned no answer. Try another model or provide more context.');
  return text;
}
export async function listModels(
  provider: Provider,
  config: ProviderConfig,
  fetcher: Fetch = fetch,
): Promise<{ id: string; label: string }[]> {
  const { base, headers, protocol } = connection(provider, config);
  const found = new Map<string, string>();
  let cursor = '';
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams();
    if (protocol === 'gemini') {
      query.set('pageSize', '100');
      if (cursor) query.set('pageToken', cursor);
    }
    if (protocol === 'messages') {
      query.set('limit', '100');
      if (cursor) query.set('after_id', cursor);
    }
    const path = protocol === 'ollama' ? '/api/tags' : `/models${query.size ? '?' + query : ''}`;
    const data = object(
      await request(base + path, provider, headers, undefined, undefined, fetcher),
    );
    const items = protocol === 'gemini' || protocol === 'ollama' ? data.models : data.data;
    if (!Array.isArray(items))
      throw new Error(
        'This endpoint did not return a model list. You can type a model ID manually.',
      );
    for (const item of objects(items)) {
      const id = (string(item.id) || string(item.name)).replace(/^models\//, '');
      if (!id || id.length > 240 || /[\s\x00-\x1f]/.test(id)) continue;
      if (typeof item.shutdown_date === 'string' && Date.parse(item.shutdown_date) <= Date.now())
        continue;
      if (
        protocol === 'gemini' &&
        !(
          Array.isArray(item.supportedGenerationMethods) &&
          item.supportedGenerationMethods.includes('generateContent')
        )
      )
        continue;
      if (
        provider === 'openai' &&
        (!/^(gpt-|o[134](?:-|$)|ft:)/.test(id) ||
          /(?:audio|realtime|transcrib|image|tts|search|moderation|embedding|codex)/.test(id))
      )
        continue;
      found.set(
        id,
        (string(item.display_name) || string(item.displayName) || modelLabel(id)).slice(0, 150),
      );
      if (found.size >= 500) break;
    }
    const next = string(
      protocol === 'gemini'
        ? data.nextPageToken
        : protocol === 'messages' && data.has_more
          ? data.last_id
          : '',
    );
    if (!next || next === cursor || found.size >= 500) break;
    cursor = String(next);
  }
  return [...found].map(([id, label]) => ({ id, label }));
}
