import { FEED_FOCUS_KEY, feedQuote, readFeedFocusSettings } from './feed-focus-settings';
import { isLinkedInHost } from './linkedin-follow';

const HOME_FEED = /^\/feed(?:\/foryou)?\/?$/;

function isHomeFeed(): boolean {
  if (!HOME_FEED.test(location.pathname)) return false;
  // Notifications can load a selected post at the same path as the Home feed.
  const query = new URLSearchParams(location.search);
  return !query.has('shareActive') && !query.get('highlightedUpdateUrn')?.trim();
}

/** Replace the Home workspace while leaving LinkedIn's own navigation in place. */
export function mountLinkedInFeedFocus(): () => void {
  if (window.top !== window || !isLinkedInHost(location.hostname) || !chrome.runtime?.id)
    return () => {};

  let settings = readFeedFocusSettings(undefined);
  let revision = 0;
  let disposed = false;
  let watching = false;
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  const cover = document.createElement('section');
  cover.id = 'eze-linkedin-feed-focus';
  cover.setAttribute('aria-label', 'Feed blocked');
  const card = document.createElement('div');
  card.className = 'eze-feed-focus-card';
  const title = document.createElement('h1');
  title.textContent = 'Feed blocked';
  const quote = document.createElement('p');
  card.append(title, quote);
  cover.append(card);

  const observer = new MutationObserver(render);
  function render() {
    if (disposed || !chrome.runtime?.id || !settings.enabled || !isHomeFeed()) {
      observer.disconnect();
      watching = false;
      cover.remove();
      return;
    }

    if (!watching) {
      // The document-start script may run before LinkedIn inserts its workspace.
      observer.observe(document, { childList: true, subtree: true });
      watching = true;
    }
    const workspace = document.querySelector('main#workspace') ?? document.querySelector('main');
    if (!workspace) {
      cover.remove();
      return;
    }

    const message = feedQuote(settings);
    if (quote.textContent !== message) quote.textContent = message;
    if (cover.nextElementSibling !== workspace) workspace.before(cover);
    const top = `${Math.max(0, Math.round(cover.getBoundingClientRect().top + window.scrollY))}px`;
    if (cover.style.getPropertyValue('--eze-feed-offset') !== top)
      cover.style.setProperty('--eze-feed-offset', top);
  }

  const onStorage: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (disposed || area !== 'local' || !changes[FEED_FOCUS_KEY]) return;
    revision++;
    settings = readFeedFocusSettings(changes[FEED_FOCUS_KEY].newValue);
    render();
  };
  function refresh() {
    if (!chrome.runtime?.id) {
      render();
      return;
    }
    const before = revision;
    void chrome.storage.local
      .get(FEED_FOCUS_KEY)
      .then((data) => {
        if (disposed || before !== revision) return;
        settings = readFeedFocusSettings(data[FEED_FOCUS_KEY]);
        render();
      })
      .catch(() => {});
  }

  chrome.storage.onChanged.addListener(onStorage);
  // Same-document URL changes include History API pushes and replacements.
  navigation?.addEventListener('currententrychange', render);
  window.addEventListener('popstate', render);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('resize', render);
  refresh();

  return () => {
    disposed = true;
    render();
    chrome.storage.onChanged.removeListener(onStorage);
    navigation?.removeEventListener('currententrychange', render);
    window.removeEventListener('popstate', render);
    window.removeEventListener('pageshow', refresh);
    window.removeEventListener('resize', render);
  };
}
