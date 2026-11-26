// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.linkedin.com/feed/foryou/"}
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FEED_FOCUS_KEY, FEED_QUOTES, type FeedFocusSettings } from '../src/feed-focus-settings';
import { mountLinkedInFeedFocus } from '../src/linkedin-feed-focus';

type StorageListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];
const listeners = new Set<StorageListener>();
const enabled: FeedFocusSettings = { enabled: true, quote: 'focus', customQuote: '' };
let get: ReturnType<typeof vi.fn<() => Promise<Record<string, unknown>>>>;
let navigation: EventTarget;
let dispose: (() => void) | undefined;

const cover = () => document.getElementById('eze-linkedin-feed-focus');
function save(next: FeedFocusSettings) {
  for (const listener of listeners) listener({ [FEED_FOCUS_KEY]: { newValue: next } }, 'local');
}
function navigate(path: string) {
  history.pushState({}, '', path);
  navigation.dispatchEvent(new Event('currententrychange'));
}

beforeEach(() => {
  history.replaceState({}, '', '/feed/foryou/');
  document.body.innerHTML =
    '<header><nav>LinkedIn navigation</nav></header><main id="workspace">Feed</main>';
  listeners.clear();
  navigation = new EventTarget();
  get = vi.fn(async () => ({}));
  vi.stubGlobal('navigation', navigation);
  vi.stubGlobal('chrome', {
    runtime: { id: 'ezeapply-test' },
    storage: {
      local: { get },
      onChanged: {
        addListener: (fn: StorageListener) => listeners.add(fn),
        removeListener: (fn: StorageListener) => listeners.delete(fn),
      },
    },
  });
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('starts off and covers a Home workspace that arrives after the preference', async () => {
  const original = document.querySelector('main')!;
  const header = document.querySelector('header')!;
  dispose = mountLinkedInFeedFocus();
  await Promise.resolve();
  expect(cover()).toBeNull();
  original.remove();
  save(enabled);
  expect(cover()).toBeNull();
  document.body.append(original);
  await vi.waitFor(() => expect(cover()?.nextElementSibling).toBe(original));
  expect(cover()?.textContent).toContain(FEED_QUOTES.focus);
  expect(document.querySelector('header')).toBe(header);

  const replacement = original.cloneNode(true);
  original.replaceWith(replacement);
  await vi.waitFor(() => expect(cover()?.nextElementSibling).toBe(replacement));
  save({ ...enabled, enabled: false });
  expect(cover()).toBeNull();
  expect(replacement.isConnected).toBe(true);
});

it('allows profiles, individual posts, jobs, messages and the composer during same-document navigation', async () => {
  history.replaceState({}, '', '/in/example/');
  get.mockResolvedValue({ [FEED_FOCUS_KEY]: enabled });
  dispose = mountLinkedInFeedFocus();
  await Promise.resolve();
  expect(cover()).toBeNull();
  for (const path of [
    '/in/example/',
    '/in/example/recent-activity/all/',
    '/company/example/posts/',
    '/feed/update/urn:li:activity:123/',
    '/feed/?shareActive=true',
    '/jobs/search/',
    '/messaging/',
  ]) {
    navigate('/feed/');
    expect(cover()).not.toBeNull();
    navigate(path);
    expect(cover()).toBeNull();
  }
  navigate('/feed/foryou/?trk=home');
  expect(cover()).not.toBeNull();
});

it('renders plain-text custom quotes and keeps changes received during its first read', async () => {
  let finishRead!: (value: Record<string, unknown>) => void;
  get.mockReturnValue(new Promise((resolve) => (finishRead = resolve)));
  dispose = mountLinkedInFeedFocus();
  save({ ...enabled, quote: 'custom', customQuote: '<b>Apply with care.</b>' });
  finishRead({});
  await Promise.resolve();
  expect(cover()?.querySelector('p')?.textContent).toBe('<b>Apply with care.</b>');
  expect(cover()?.querySelector('b')).toBeNull();
  save({ ...enabled, quote: 'progress' });
  expect(cover()?.querySelector('p')?.textContent).toBe(FEED_QUOTES.progress);
});

it('opens highlighted notification posts on the feed URL and blocks ordinary Home visits', async () => {
  const post =
    '/feed/?highlightedUpdateUrn=urn%3Ali%3Aactivity%3A123&highlightedUpdateType=SHARED_BY_YOUR_NETWORK&origin=inapp&showCommentBox=true';
  history.replaceState({}, '', post);
  get.mockResolvedValue({ [FEED_FOCUS_KEY]: enabled });
  dispose = mountLinkedInFeedFocus();
  await Promise.resolve();
  expect(cover()).toBeNull();

  navigate('/feed/?trk=home');
  expect(cover()).not.toBeNull();
  navigate(post);
  expect(cover()).toBeNull();
  navigate('/feed/?highlightedUpdateUrn=');
  expect(cover()).not.toBeNull();
});
