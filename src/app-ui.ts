import {
  normalizeProfile,
  parseProfileImport,
  record,
  string,
  type ApplicantProfile,
} from './app-profile';
import { mountPopupControls } from './popup-controls';
import { navigationIcon } from './navigation-icon';
import { mountProfileView } from './profile-view';
import { mountApplicationCount, applicationCount } from './application-count';
import { mountActivityControls } from './activity-controls';
import { aiSettingsHero, aiSideEntry, aiPowerIcon } from './ai-entry';
import { localDayKey } from './tracking-model';
import {
  TRACKING_CACHE_KEY,
  TRACKING_DAILY_TOTALS_KEY,
  type TrackingSnapshot,
} from './tracking-types';
import { APPLICATION_COUNTS_KEY } from './types';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = text;
  return node;
}
function button(text: string, cls = 'quiet-button'): HTMLButtonElement {
  const node = el('button', cls, text);
  node.type = 'button';
  return node;
}
function link(text: string, path: string, cls = ''): HTMLAnchorElement {
  const node = el('a', cls, text);
  node.href = chrome.runtime.getURL(path);
  return node;
}
function brand(): HTMLImageElement {
  const img = el('img', 'wordmark');
  img.src = chrome.runtime.getURL('custom/wordmark.svg');
  img.alt = 'EZEapply';
  img.width = 236;
  img.height = 40;
  return img;
}
async function rpc(
  type: string,
  extra: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const result = await chrome.runtime.sendMessage({ type, ...extra });
  if (!result?.ok) throw new Error(result?.error || 'Could not save this change. Try again.');
  return result;
}
function errorText(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : 'This action could not be completed. Try again.';
}
function statusNode(): HTMLParagraphElement {
  const node = el('p', 'app-status');
  node.setAttribute('role', 'status');
  node.hidden = true;
  return node;
}
export function profileDate(value: unknown): string {
  if (typeof value === 'string') return value;
  const date = record(value),
    year = String(date.year ?? ''),
    month = String(date.month ?? '');
  return /^\d{4}$/.test(year) && /^(?:[1-9]|1[0-2])$/.test(month)
    ? `${year}-${month.padStart(2, '0')}`
    : '';
}
function showStatus(node: HTMLElement, text: string, error = false): void {
  node.textContent = text;
  node.hidden = !text;
  node.classList.toggle('error', error);
}
export function safeWebsite(value: string): string {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : '';
  } catch {
    return '';
  }
}
export function downloadFile(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob),
    anchor = el('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function resumeFromFile(file: File): Promise<ApplicantProfile['resumeData']> {
  if (!file.size || file.size > 20 * 1024 * 1024)
    throw new Error('Choose a nonempty resume smaller than 20 MB.');
  if (!/\.(pdf|doc|docx|txt|rtf|odt)$/i.test(file.name))
    throw new Error('Choose a PDF, DOC, DOCX, text, RTF or ODT resume.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return normalizeProfile({
    resumeData: {
      fileName: file.name,
      resumeBase64: btoa(binary),
      fileSize: file.size / 1024,
      dateUploaded: new Date().toISOString(),
    },
  }).resumeData;
}
function resumeDownload(saved: ApplicantProfile['resumeData']): void {
  const raw = string(saved.resumeBase64).replace(/^data:[^,]+,/, ''),
    bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  downloadFile(string(saved.fileName), new Blob([bytes]));
}
function masterSwitch(initial: boolean): HTMLElement {
  const row = el('label', 'master-switch'),
    toggle = el('input'),
    caption = el('span', '', `Autofill ${initial ? 'Enabled' : 'Disabled'}`),
    status = statusNode();
  toggle.type = 'checkbox';
  toggle.checked = initial;
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', 'Enable autofill');
  toggle.addEventListener('change', async () => {
    const desired = toggle.checked;
    toggle.disabled = true;
    try {
      await rpc('eze-app:autofill', { enabled: desired });
      caption.textContent = `Autofill ${desired ? 'Enabled' : 'Disabled'}`;
      showStatus(status, '');
    } catch (error) {
      toggle.checked = !desired;
      showStatus(status, errorText(error), true);
    } finally {
      toggle.disabled = false;
    }
  });
  row.append(toggle, caption);
  const block = el('div', 'master-control');
  block.append(row, status);
  return block;
}
function ring(): HTMLElement {
  const chart = el('div', 'daily-ring');
  chart.dataset.chart = 'today';
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 240 240');
  svg.setAttribute('aria-hidden', 'true');
  for (const cls of ['ring-track', 'ring-value']) {
    const circle = document.createElementNS(ns, 'circle');
    for (const [key, value] of Object.entries({
      cx: '120',
      cy: '120',
      r: '105',
      fill: 'none',
      class: cls,
    }))
      circle.setAttribute(key, value);
    svg.append(circle);
  }
  const text = el('div', 'ring-text');
  text.append(
    el('strong', 'daily-total', '0'),
    el('span', '', 'Applications Today'),
    el('small', 'daily-goal', 'Goal: 10'),
  );
  chart.append(svg, text);
  return chart;
}
export async function mountApp(root: HTMLElement): Promise<() => void> {
  let disposed = false,
    view = 0;
  const path = location.pathname,
    popup = path.endsWith('/popup.html'),
    side = path.endsWith('/sidepanel.html');
  const cleanup: (() => void)[] = [];
  let settings: Record<string, unknown> = await chrome.storage.local.get([
    'profile',
    'autofillEnabled',
    'dailyGoal',
    TRACKING_DAILY_TOTALS_KEY,
    'appliedList',
    APPLICATION_COUNTS_KEY,
  ]);
  if (disposed) return () => {};
  function counts() {
    const cached = record(record(settings[TRACKING_DAILY_TOTALS_KEY])[localDayKey()]).total;
    return typeof cached === 'number' && Number.isSafeInteger(cached) && cached >= 0
      ? cached
      : applicationCount(settings.appliedList, settings[APPLICATION_COUNTS_KEY]);
  }
  function paintCount() {
    const total = counts(),
      goal =
        typeof settings.dailyGoal === 'number' && settings.dailyGoal > 0 ? settings.dailyGoal : 10;
    for (const node of root.querySelectorAll('.daily-total')) node.textContent = String(total);
    for (const node of root.querySelectorAll('.daily-goal')) node.textContent = `Goal: ${goal}`;
    const circle = root.querySelector('.ring-value');
    if (circle instanceof SVGElement) {
      circle.style.strokeDasharray = `${Math.min(1, total / goal) * 660} 660`;
      circle.style.opacity = total > 0 ? '1' : '0';
    }
    const bar = root.querySelector<HTMLElement>('.daily-progress-value');
    if (bar) bar.style.width = `${Math.min(100, (total / goal) * 100)}%`;
  }
  if (popup) {
    const windowId = (await chrome.windows.getCurrent()).id;
    document.body.classList.add('popup-page');
    const extensions = button('', 'popup-extensions');
    extensions.title = 'Open Chrome extensions';
    extensions.setAttribute('aria-label', 'Open Chrome extensions');
    extensions.append(navigationIcon('extensions'));
    extensions.addEventListener('click', async () => {
      extensions.disabled = true;
      try {
        await chrome.tabs.create({ url: 'chrome://extensions/' });
        showStatus(status, '');
      } catch (error) {
        showStatus(status, errorText(error), true);
      } finally {
        extensions.disabled = false;
      }
    });
    root.append(extensions, brand(), ring());
    const shortcuts = el('div', 'popup-shortcuts');
    for (const [title, target, kind] of [
      ['View Applications', 'options.html#/', 'applications'],
      ['Manage Profile', 'options.html#/profile', 'profile'],
      ['Manage Settings', 'options.html#/settings/autofill', 'settings'],
    ] as const) {
      const control = button('', 'popup-shortcut');
      control.title = title;
      control.setAttribute('aria-label', title);
      control.append(navigationIcon(kind));
      control.addEventListener('click', () => {
        void chrome.tabs.create({ url: chrome.runtime.getURL(target) });
      });
      shortcuts.append(control);
    }
    root.append(shortcuts);
    const quick = button('Quick Access Sidepane', 'quick-access');
    quick.prepend(navigationIcon('sidepane'));
    quick.title = 'Open the EZEapply side panel';
    const status = statusNode();
    quick.addEventListener('click', () => {
      if (windowId === undefined) {
        showStatus(status, 'No active Chrome window.', true);
        return;
      }
      void chrome.sidePanel.open({ windowId }).then(
        () => window.close(),
        (error) => showStatus(status, errorText(error), true),
      );
    });
    root.append(quick, status);
    const switches = el('div', 'popup-switches'),
      master = masterSwitch(settings.autofillEnabled !== false);
    switches.append(...master.childNodes);
    root.append(switches);
    const preferences = mountPopupControls();
    cleanup.push(() => preferences.dispose());
  } else if (side) {
    document.body.classList.add('sidepanel-page');
    const summary = el('section', 'side-summary'),
      heading = el('h1');
    heading.append(
      el('strong', 'daily-total', '0'),
      document.createTextNode(' Applications '),
      el('small', '', 'today'),
    );
    const progress = el('div', 'daily-progress');
    progress.append(el('span', 'daily-progress-value'));
    summary.append(heading, el('p', 'daily-goal', 'Goal: 10'), progress);
    root.append(summary);
    const shortcuts = el('div', 'side-links');
    shortcuts.append(
      link('Edit profile', 'options.html#/profile'),
      link('Applications', 'options.html#/'),
      link('Analytics', 'analytics.html'),
    );
    for (const anchor of shortcuts.querySelectorAll('a')) anchor.target = '_blank';
    let profileView = mountProfileView(normalizeProfile(settings.profile), resumeDownload);
    root.append(shortcuts, el('h2', 'side-profile-title', 'Profile'), profileView.element);
    const profileChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (disposed || area !== 'local' || !changes.profile) return;
      const next = mountProfileView(normalizeProfile(changes.profile.newValue), resumeDownload);
      profileView.element.replaceWith(next.element);
      profileView.dispose();
      profileView = next;
    };
    chrome.storage.onChanged.addListener(profileChanged);
    cleanup.push(() => {
      profileView.dispose();
      chrome.storage.onChanged.removeListener(profileChanged);
    });
  } else {
    document.body.classList.add('options-page');
    const header = el('header', 'app-header'),
      home = link('', 'options.html#/');
    home.append(brand());
    const nav = el('nav', 'app-nav');
    nav.setAttribute('aria-label', 'Main navigation');
    for (const [title, hash] of [
      ['Applications', '#/'],
      ['Profile', '#/profile'],
      ['Settings', '#/settings/autofill'],
    ]) {
      const anchor = el('a', '', title);
      anchor.href = hash;
      nav.append(anchor);
    }
    nav.append(link('Analytics', 'analytics.html'));
    const ai = link('AI settings', 'ai-settings.html', 'nav-ai');
    ai.prepend(aiPowerIcon());
    nav.append(ai);
    header.append(home, nav);
    const main = el('main', 'app-main'),
      footer = el(
        'footer',
        'app-footer',
        `Created by Piyush Agarwal · EZEapply ${chrome.runtime.getManifest().version}`,
      );
    root.append(header, main, footer);
    const render = async () => {
      const revision = ++view;
      try {
        settings = {
          ...settings,
          ...(await chrome.storage.local.get(['profile', 'autofillEnabled', 'dailyGoal'])),
        };
        if (disposed || revision !== view) return;
        const hash = location.hash;
        for (const anchor of nav.querySelectorAll('a')) {
          const selected = anchor.getAttribute('href') === (hash || '#/');
          anchor.classList.toggle('active', selected);
          if (selected) anchor.setAttribute('aria-current', 'page');
          else anchor.removeAttribute('aria-current');
        }
        main.replaceChildren();
        if (hash.startsWith('#/profile')) renderProfile(main, normalizeProfile(settings.profile));
        else if (hash.startsWith('#/settings')) {
          const section = el('div', 'settings-layout'),
            aside = el('aside');
          aside.append(aiSideEntry(chrome.runtime.getURL('ai-settings.html')));
          const card = el('section', 'card');
          card.append(
            el('h2', '', 'Autofill'),
            masterSwitch(settings.autofillEnabled !== false),
            el(
              'p',
              'muted',
              'Saved answers fill empty application fields. Your edits are kept. Choose automatic filling in the toolbar popup.',
            ),
            link('Open reusable answers', 'custom-fields.html', 'text-link'),
            link('Edit goal & view progress', 'analytics.html', 'text-link'),
          );
          section.append(aside, card);
          main.append(
            el('h1', '', 'Settings'),
            aiSettingsHero(chrome.runtime.getURL('ai-settings.html')),
            section,
          );
        } else {
          await renderApplications(main, () => !disposed && revision === view);
        }
      } catch (error) {
        if (revision === view) {
          main.replaceChildren(
            el('h1', '', 'Could not load this page'),
            el('p', 'error', errorText(error)),
          );
        }
      }
    };
    const changed = () => {
      void render();
    };
    window.addEventListener('hashchange', changed);
    cleanup.push(() => window.removeEventListener('hashchange', changed));
    await render();
    const refreshHistory: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (
        area === 'local' &&
        changes[TRACKING_CACHE_KEY] &&
        !location.hash.startsWith('#/profile') &&
        !location.hash.startsWith('#/settings')
      )
        void render();
    };
    chrome.storage.onChanged.addListener(refreshHistory);
    cleanup.push(() => chrome.storage.onChanged.removeListener(refreshHistory));
  }
  if (popup || side) {
    paintCount();
    const count = mountApplicationCount(),
      activity = mountActivityControls();
    cleanup.push(
      () => count.dispose(),
      () => activity.dispose(),
    );
    const changed: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== 'local') return;
      for (const [key, value] of Object.entries(changes)) settings[key] = value.newValue;
      paintCount();
    };
    chrome.storage.onChanged.addListener(changed);
    const timer = setInterval(paintCount, 60000);
    cleanup.push(
      () => chrome.storage.onChanged.removeListener(changed),
      () => clearInterval(timer),
    );
  }
  return () => {
    disposed = true;
    view++;
    cleanup.forEach((fn) => fn());
    root.replaceChildren();
  };
}

async function renderApplications(main: HTMLElement, current: () => boolean): Promise<void> {
  const result = await rpc('eze-tracking:snapshot'),
    snapshot = result.snapshot as TrackingSnapshot;
  const data = await chrome.storage.local.get('eze.applicationStages.v1');
  if (!current()) return;
  const stages = record(data['eze.applicationStages.v1']),
    heading = el('div', 'page-heading');
  heading.append(
    el('h1', '', 'Applications'),
    link('View analytics ↗', 'analytics.html', 'quiet-button'),
  );
  const controls = el('div', 'application-filters'),
    search = el('input'),
    source = el('select'),
    stage = el('select');
  search.type = 'search';
  search.placeholder = 'Search applications…';
  search.setAttribute('aria-label', 'Search applications');
  for (const [value, text] of [
    ['', 'All sources'],
    ['linkedin', 'LinkedIn Easy Apply'],
    ['external', 'External forms'],
    ['unknown', 'Imported / unclassified'],
  ]) {
    const option = el('option', '', text);
    option.value = value;
    source.append(option);
  }
  source.setAttribute('aria-label', 'Application source');
  for (const value of ['Any stage', 'Applied', 'Interview', 'Offer', 'Rejected'])
    stage.append(el('option', '', value));
  stage.setAttribute('aria-label', 'Application stage');
  controls.append(search, source, stage);
  const status = statusNode(),
    container = el('div', 'application-list'),
    note = el(
      'p',
      'muted',
      'Confirmed submissions are captured automatically. Correct missed counts with − / + in the popup.',
    );
  const pages = el('nav', 'journal-pages'),
    range = el('span', 'muted'),
    previous = button('← Previous'),
    next = button('Next →');
  pages.setAttribute('aria-label', 'Application journal pages');
  pages.append(range, previous, next);
  let page = 0;
  previous.addEventListener('click', () => {
    page = Math.max(0, page - 1);
    draw();
  });
  next.addEventListener('click', () => {
    page++;
    draw();
  });
  main.append(heading, note, controls, status, container, pages);
  function draw() {
    container.replaceChildren();
    const matches = snapshot.records
      .filter(
        (item) =>
          `${item.jobTitle} ${item.company}`.toLowerCase().includes(search.value.toLowerCase()) &&
          (!source.value || item.source === source.value) &&
          (stage.value === 'Any stage' || (stages[item.id] || 'Applied') === stage.value),
      )
      .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
    page = Math.min(page, Math.max(0, Math.ceil(matches.length / 50) - 1));
    pages.hidden = matches.length === 0;
    previous.disabled = page === 0;
    next.disabled = (page + 1) * 50 >= matches.length;
    range.textContent = `${page * 50 + 1}–${Math.min(matches.length, (page + 1) * 50)} of ${matches.length}`;
    if (!matches.length) {
      const empty = el('section', 'card empty-state');
      empty.append(
        navigationIcon('applications'),
        el('h2', '', 'Your next opportunity starts here'),
        el(
          'p',
          'muted',
          snapshot.records.length
            ? 'No applications match these filters.'
            : 'Confirmed applications will appear here. Open a job form and use EZEapply to get started.',
        ),
      );
      container.append(empty);
      return;
    }
    const table = el('table'),
      head = el('thead'),
      row = el('tr');
    for (const title of ['Job & company', 'Source', 'Stage', 'Applied'])
      row.append(el('th', '', title));
    head.append(row);
    table.append(head);
    const body = el('tbody');
    for (const item of matches.slice(page * 50, (page + 1) * 50)) {
      const row = el('tr'),
        job = el('td'),
        url = safeWebsite(item.url),
        title = url
          ? el('a', 'job-title', item.jobTitle || 'Application')
          : el('strong', 'job-title', item.jobTitle || 'Application');
      if (title instanceof HTMLAnchorElement) {
        title.href = url;
        title.target = '_blank';
        title.rel = 'noopener noreferrer';
      }
      job.append(title, el('small', 'muted', item.company || 'Company not captured'));
      const src = el('td');
      src.append(
        el(
          'span',
          `source-chip ${item.source}`,
          item.source === 'linkedin'
            ? 'LinkedIn'
            : item.source === 'external'
              ? 'External form'
              : 'Imported',
        ),
      );
      const progress = el('td'),
        select = el('select');
      select.setAttribute('aria-label', `Stage for ${item.jobTitle || 'application'}`);
      for (const value of ['Applied', 'Interview', 'Offer', 'Rejected'])
        select.append(el('option', '', value));
      select.value = string(stages[item.id]) || 'Applied';
      select.addEventListener('change', async () => {
        const desired = select.value;
        select.disabled = true;
        try {
          await rpc('eze-app:stage', { id: item.id, stage: desired });
          stages[item.id] = desired;
          showStatus(status, 'Stage saved.');
        } catch (error) {
          select.value = string(stages[item.id]) || 'Applied';
          showStatus(status, errorText(error), true);
        } finally {
          select.disabled = false;
        }
      });
      progress.append(select);
      row.append(
        job,
        src,
        progress,
        el(
          'td',
          'muted',
          new Date(item.submittedAt).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }),
        ),
      );
      body.append(row);
    }
    table.append(body);
    container.append(table);
  }
  const filter = () => {
    page = 0;
    draw();
  };
  search.addEventListener('input', filter);
  source.addEventListener('change', filter);
  stage.addEventListener('change', filter);
  draw();
}

function renderProfile(main: HTMLElement, profile: ApplicantProfile): void {
  const heading = el('div', 'page-heading'),
    tools = el('div', 'toolbar'),
    exportButton = button('Export'),
    importButton = button('Import'),
    picker = el('input');
  picker.type = 'file';
  picker.accept = '.json,application/json';
  picker.hidden = true;
  heading.append(el('h1', '', 'Profile'), tools);
  tools.append(importButton, exportButton, picker);
  const form = el('form', 'profile-form'),
    status = statusNode();
  main.append(
    heading,
    el(
      'p',
      'muted',
      'Your profile stays on this device. Saved answers and AI use these facts when enabled.',
    ),
    status,
    form,
  );
  const sync: (() => void)[] = [];
  let busy = false,
    dirty = false;
  const save = el('button', 'primary-button', 'Save profile');
  save.type = 'submit';
  form.addEventListener('input', () => {
    dirty = true;
    showStatus(status, 'Unsaved changes');
  });
  function field(
    parent: HTMLElement,
    label: string,
    obj: Record<string, unknown>,
    key: string,
    type = 'text',
  ) {
    const wrapper = el('label', 'form-field');
    wrapper.append(el('span', '', label));
    const input = type === 'textarea' ? el('textarea') : el('input');
    if (input instanceof HTMLInputElement) input.type = type;
    const original = obj[key];
    input.value =
      typeof original === 'boolean'
        ? original
          ? 'Yes'
          : 'No'
        : typeof original === 'number'
          ? String(original)
          : string(original);
    if (key === 'startDate' || key === 'endDate') input.value = profileDate(original);
    let initial = input.value;
    if (input instanceof HTMLTextAreaElement) input.rows = 3;
    input.maxLength = 30000;
    wrapper.append(input);
    sync.push(() => {
      if (input.value !== initial) {
        const value = input.value.trim();
        obj[key] =
          typeof original === 'boolean' && /^(yes|no)$/i.test(value)
            ? value.toLowerCase() === 'yes'
            : value;
        initial = input.value;
      }
    });
    parent.append(wrapper);
  }
  function section(title: string) {
    const section = el('section', 'card profile-section');
    section.append(el('h2', '', title));
    const grid = el('div', 'form-grid');
    section.append(grid);
    form.append(section);
    return grid;
  }
  let grid = section('Personal details');
  field(grid, 'Profile name', profile as unknown as Record<string, unknown>, 'profileName');
  for (const [label, key] of [
    ['First name', 'firstName'],
    ['Middle name', 'middleName'],
    ['Last name', 'lastName'],
  ])
    field(grid, label, profile.nameData, key);
  grid = section('Contact & address');
  for (const [label, key, type] of [
    ['Email', 'email', 'email'],
    ['Phone number (include country code)', 'phoneNumber', 'tel'],
  ])
    field(grid, label, profile.contactData, key, type);
  for (const [label, key] of [
    ['Address line 1', 'line1'],
    ['Address line 2', 'line2'],
    ['City', 'city'],
    ['State / province', 'state'],
    ['Postal code', 'postalCode'],
    ['Country', 'country'],
  ])
    field(grid, label, profile.addressData, key);
  grid = section('Portfolio');
  for (const [label, key] of [
    ['LinkedIn', 'linkedin'],
    ['GitHub', 'github'],
    ['Personal website', 'personal'],
  ])
    field(grid, label, profile.websiteData, key, 'url');
  const extra = {
      websites: Array.isArray(profile.websiteData.websites)
        ? profile.websiteData.websites.filter((v) => typeof v === 'string').join('\n')
        : '',
    },
    skills = { skills: profile.skillsData.join(', ') };
  field(grid, 'Other links (one per line)', extra, 'websites', 'textarea');
  field(grid, 'Skills (comma separated)', skills, 'skills');
  sync.push(() => {
    profile.websiteData.websites = extra.websites
      .split('\n')
      .map((v) => v.trim())
      .filter(Boolean);
    profile.skillsData = skills.skills
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  });
  const resume = el('div', 'resume-editor'),
    resumeName = el('span', 'muted', string(profile.resumeData.fileName) || 'No resume saved'),
    resumePicker = el('input'),
    replace = button('Choose resume'),
    download = button('Download'),
    remove = button('Remove resume');
  resumePicker.type = 'file';
  resumePicker.accept = '.pdf,.doc,.docx,.txt,.rtf,.odt';
  resumePicker.hidden = true;
  download.disabled = remove.disabled = !string(profile.resumeData.resumeBase64);
  replace.addEventListener('click', () => resumePicker.click());
  download.addEventListener('click', () => resumeDownload(profile.resumeData));
  remove.addEventListener('click', () => {
    if (confirm('Remove the saved resume? Save profile to keep this change.')) {
      profile.resumeData = {};
      resumeName.textContent = 'No resume saved';
      download.disabled = remove.disabled = true;
      dirty = true;
      showStatus(status, 'Unsaved changes');
    }
  });
  resumePicker.addEventListener('change', async () => {
    const file = resumePicker.files?.[0];
    if (!file) return;
    busy = true;
    save.disabled = replace.disabled = true;
    try {
      profile.resumeData = await resumeFromFile(file);
      resumeName.textContent = string(profile.resumeData.fileName);
      download.disabled = remove.disabled = false;
      dirty = true;
      showStatus(status, 'Resume ready. Save profile to keep it.');
    } catch (error) {
      showStatus(status, errorText(error), true);
    } finally {
      busy = false;
      save.disabled = replace.disabled = false;
      resumePicker.value = '';
    }
  });
  resume.append(resumeName, replace, download, remove, resumePicker);
  grid.parentElement?.append(resume);
  function history(
    title: string,
    key: 'jobData' | 'educationData' | 'languageData',
    columns: [string, string, string?][],
    flag?: [string, string],
  ) {
    const section = el('section', 'card profile-section'),
      titleRow = el('div', 'page-heading'),
      add = button('+ Add');
    titleRow.append(el('h2', '', title), add);
    const entries = el('div', 'history-entries');
    section.append(titleRow, entries);
    form.append(section);
    function entry(item: Record<string, unknown>) {
      const box = el('fieldset', 'history-editor'),
        grid = el('div', 'form-grid'),
        deleteEntry = button('Remove entry', 'danger-button');
      for (const [label, key, type] of columns) field(grid, label, item, key, type);
      if (flag) {
        const row = el('label', 'check-field'),
          input = el('input');
        input.type = 'checkbox';
        input.checked = item[flag[1]] === true;
        row.append(input, document.createTextNode(flag[0]));
        grid.append(row);
        sync.push(() => {
          item[flag[1]] = input.checked;
        });
      }
      deleteEntry.addEventListener('click', () => {
        if (confirm('Remove this entry? Save profile to keep this change.')) {
          profile[key] = profile[key].filter((value) => value !== item);
          box.remove();
          dirty = true;
          showStatus(status, 'Unsaved changes');
        }
      });
      box.append(grid, deleteEntry);
      entries.append(box);
    }
    profile[key].forEach(entry);
    add.addEventListener('click', () => {
      if (profile[key].length >= 100) {
        showStatus(status, 'This section is limited to 100 entries.', true);
        return;
      }
      const item = {};
      profile[key].push(item);
      entry(item);
      dirty = true;
      entries.lastElementChild?.querySelector('input')?.focus();
    });
  }
  history(
    'Work history',
    'jobData',
    [
      ['Job title', 'jobTitle'],
      ['Company', 'company'],
      ['Location', 'location'],
      ['Start date', 'startDate'],
      ['End date', 'endDate'],
      ['Description', 'description', 'textarea'],
    ],
    ['I currently work here', 'currentlyWorkHere'],
  );
  history('Education', 'educationData', [
    ['School / institution', 'school'],
    ['Degree', 'degree'],
    ['Field of study', 'fieldOfStudy'],
    ['Start date', 'startDate'],
    ['End date', 'endDate'],
  ]);
  history('Languages', 'languageData', [
    ['Language', 'language'],
    ['Proficiency', 'proficiency'],
  ]);
  grid = section('Employment information');
  for (const [label, key] of [
    ['Authorized to work in country of residence', 'eligibilityUS'],
    ['Visa sponsorship', 'sponsorship'],
    ['Gender', 'gender'],
    ['Ethnicity', 'ethnicity'],
    ['Veteran status', 'veteranStatus'],
    ['Disability', 'disability'],
    ['Age', 'age'],
  ])
    field(grid, label, profile.employmentData, key);
  form.append(save);
  const collect = () => {
    sync.forEach((fn) => fn());
    return normalizeProfile(profile);
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    save.disabled = true;
    try {
      await rpc('eze-app:save-profile', { profile: collect() });
      dirty = false;
      showStatus(status, 'Profile saved.');
    } catch (error) {
      showStatus(status, errorText(error), true);
    } finally {
      busy = false;
      save.disabled = false;
    }
  });
  exportButton.addEventListener('click', () => {
    try {
      downloadFile(
        'EZEapply-profile.json',
        new Blob([JSON.stringify({ version: 1, profile: collect() }, null, 2)], {
          type: 'application/json',
        }),
      );
    } catch (error) {
      showStatus(status, errorText(error), true);
    }
  });
  importButton.addEventListener('click', () => picker.click());
  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    if (!file || busy) return;
    try {
      if (file.size > 32_000_000) throw new Error('Choose a profile export smaller than 32 MB.');
      const imported = parseProfileImport(await file.text());
      if (dirty && !confirm('Replace your unsaved profile edits with this import?')) return;
      if (
        !confirm(
          'Replace your saved profile with this imported profile? Reusable answers and API keys stay unchanged.',
        )
      )
        return;
      busy = true;
      importButton.disabled = true;
      await rpc('eze-app:save-profile', { profile: imported });
      main.replaceChildren();
      renderProfile(main, imported);
      const next = main.querySelector<HTMLElement>('.app-status');
      if (next) showStatus(next, 'Profile imported.');
    } catch (error) {
      showStatus(status, errorText(error), true);
    } finally {
      busy = false;
      importButton.disabled = false;
      picker.value = '';
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id && typeof document !== 'undefined') {
  const root = document.getElementById('root');
  if (root)
    void mountApp(root).catch((error) => {
      root.replaceChildren(el('p', 'error', errorText(error)));
    });
}
