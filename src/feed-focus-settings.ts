export const FEED_FOCUS_KEY = 'eze.linkedin.feedFocus.v1';
export const FEED_QUOTE_LIMIT = 180;

export const FEED_QUOTES = {
  focus: 'Stay focused on what brought you here.',
  progress: 'Small steps make real progress.',
  intention: 'Give your attention to what matters.',
} as const;

type FeedQuoteChoice = keyof typeof FEED_QUOTES | 'custom';

export interface FeedFocusSettings {
  enabled: boolean;
  quote: FeedQuoteChoice;
  customQuote: string;
}

export function readFeedFocusSettings(raw: unknown): FeedFocusSettings {
  const saved = raw as Partial<FeedFocusSettings> | null | undefined;
  const customQuote =
    typeof saved?.customQuote === 'string'
      ? saved.customQuote.trim().slice(0, FEED_QUOTE_LIMIT)
      : '';
  const choice = saved?.quote;
  return {
    enabled: saved?.enabled === true,
    quote:
      choice && (Object.hasOwn(FEED_QUOTES, choice) || (choice === 'custom' && customQuote))
        ? choice
        : 'focus',
    customQuote,
  };
}

export function feedQuote(settings: FeedFocusSettings): string {
  return settings.quote === 'custom' ? settings.customQuote : FEED_QUOTES[settings.quote];
}
