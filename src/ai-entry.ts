function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Generated AI brandmark, packaged locally with its transparent background. */
export function aiPowerIcon(): HTMLImageElement {
  const image = node('img', 'eze-ai-logo');
  image.src = chrome.runtime.getURL('custom/ai-logo.png');
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.width = 64;
  image.height = 64;
  image.decoding = 'async';
  return image;
}

export function aiSideEntry(url: string): HTMLAnchorElement {
  const link = node('a', 'eze-native-ai-link eze-native-ai-side');
  link.href = url;
  link.dataset.ezeAiLink = 'true';
  const icon = node('span', 'eze-ai-side-icon');
  icon.append(aiPowerIcon());
  const copy = node('span', 'eze-ai-side-copy');
  copy.append(
    node('strong', '', 'AI providers & keys'),
    node('small', '', 'Power up your applications'),
  );
  link.append(icon, copy);
  return link;
}

export function aiSettingsHero(url: string): HTMLElement {
  const hero = node('section', 'eze-ai-hero');
  hero.dataset.ezeAiHero = 'true';
  hero.setAttribute('aria-labelledby', 'eze-ai-hero-title');
  const icon = node('div', 'eze-ai-power-icon');
  icon.append(aiPowerIcon());
  const copy = node('div', 'eze-ai-hero-copy');
  const title = node('h2', '', 'Your application superpower');
  title.id = 'eze-ai-hero-title';
  const providers = node('div', 'eze-ai-provider-list');
  providers.setAttribute('aria-label', 'Supported AI providers');
  for (const name of ['OpenAI', 'Claude', 'Gemini', '+ more'])
    providers.append(node('span', '', name));
  copy.append(
    node('span', 'eze-ai-eyebrow', 'EZEapply AI'),
    title,
    node('p', '', 'Connect your AI provider. Choose your model. Draft answers in your own voice.'),
    providers,
  );
  const actions = node('div', 'eze-ai-hero-actions');
  const link = node('a', 'eze-ai-configure', 'Configure AI');
  link.href = url;
  const arrow = node('span', '', '↗');
  arrow.setAttribute('aria-hidden', 'true');
  link.append(arrow);
  actions.append(link, node('span', 'eze-ai-hero-hint', 'Your keys. Your models.'));
  hero.append(icon, copy, actions);
  return hero;
}
