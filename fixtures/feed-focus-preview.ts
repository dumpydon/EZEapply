import { mountLinkedInFeedFocus } from '../src/linkedin-feed-focus';

const pages: Record<string, [string, string]> = {
  '/feed/': ['Home feed', 'An example update from your network.'],
  '/feed/foryou/': ['For You feed', 'An example recommended post.'],
  '/in/example/': ['Example profile', 'About this person'],
  '/in/example/recent-activity/all/': ['Profile activity', 'An example post from this person.'],
  '/feed/update/example-post/': ['Individual post', 'A post opened directly.'],
  '/jobs/': ['Jobs', 'Example job results'],
  '/messaging/': ['Messaging', 'Example conversation'],
};

const links = [...document.querySelectorAll<HTMLAnchorElement>('header nav a')];
function follow(link: HTMLAnchorElement, event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return;
  event.preventDefault();
  history.pushState({}, '', link.pathname + link.search);
  render();
}
function render() {
  const notificationPost =
    location.pathname === '/feed/' &&
    new URLSearchParams(location.search).has('highlightedUpdateUrn');
  const [title, detail] = notificationPost
    ? ['Highlighted post', 'An example post opened from Notifications.']
    : pages[location.pathname];
  const workspace = document.createElement('main');
  workspace.id = 'workspace';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const article = document.createElement('article');
  const paragraph = document.createElement('p');
  paragraph.textContent = detail;
  article.append(paragraph);
  if (notificationPost) {
    const profile = document.createElement('a');
    profile.href = '/in/example/';
    profile.textContent = 'Open author profile';
    profile.addEventListener('click', (event) => follow(profile, event));
    article.append(profile);
  }
  workspace.append(heading, article);
  document.getElementById('workspace')!.replaceWith(workspace);
  for (const link of links) {
    if (link.pathname === location.pathname && link.search === location.search)
      link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
for (const link of links) link.addEventListener('click', (event) => follow(link, event));
window.addEventListener('popstate', render);
render();
mountLinkedInFeedFocus();
