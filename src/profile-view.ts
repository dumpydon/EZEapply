import { record, string, type ApplicantProfile } from './app-profile';

const paths = {
  person:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5 18a7 7 0 0 1 14 0M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  work: 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 11c5 4 13 4 18 0M12 11v4M5 7h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z',
  education: 'm2 8 10-5 10 5-10 5L2 8Zm4 2v7c4 3 8 3 12 0v-7M22 8v8',
  portfolio:
    'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5M14 3l6 6h-6V3ZM22 22l-3-3M21 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z',
  github:
    'M9 21v-4c-4 1-5-2-6-3M15 21v-4c0-1-.3-1.5-1-2 4-.5 6-2 6-6 0-1.5-.5-2.5-1.5-3.5.3-1 .2-2-.5-3-1.7 0-3 1-4 1.5a12 12 0 0 0-4 0C9 3.5 7.7 2.5 6 2.5c-.7 1-.8 2-.5 3C4.5 6.5 4 7.5 4 9c0 4 2 5.5 6 6-.7.5-1 1-1 2',
  linkedin:
    'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM7 10v7M7 7v.1M11 17v-7m0 3a3 3 0 0 1 6 0v4',
  location: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  calendar:
    'M7 3v4m10-4v4M3 10h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM7 14h2m4 0h2m-8 3h2',
  edit: 'm15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z',
  open: 'M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  employment: 'm3 8 4-4 5 2 5-2 4 4-9 11L3 8Zm5 6 4-4 4 4M6 16l3 3m6-12-3 3-3-2',
} as const;
type Icon = keyof typeof paths;
function icon(kind: Icon): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg'),
    path = document.createElementNS(ns, 'path');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.7',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }))
    svg.setAttribute(key, value);
  path.setAttribute('d', paths[kind]);
  svg.append(path);
  return svg;
}
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
function button(cls: string, text = ''): HTMLButtonElement {
  const node = el('button', cls, text);
  node.type = 'button';
  return node;
}
function prettyDate(value: unknown): string {
  const data = record(value),
    raw = string(value),
    match = /^(\d{4})-(\d{1,2})(?:-\d{2})?$/.exec(raw),
    year = match?.[1] ?? data.year,
    month = Number(match?.[2] ?? data.month);
  if (/^\d{4}$/.test(String(year))) {
    return month >= 1 && month <= 12
      ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${year}`
      : String(year);
  }
  return raw;
}
function websiteInfo(value: string, key: string): { label: string; kind: Icon; href: string } {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    let label = key === 'personal' ? 'Website' : key;
    let kind: Icon = 'globe';
    if (key === 'github' || host === 'github.com') {
      kind = 'github';
      label =
        key === 'github' ? 'GitHub' : url.pathname.split('/').filter(Boolean).pop() || 'GitHub';
    } else if (key === 'linkedin' || host === 'linkedin.com') {
      kind = 'linkedin';
      label = 'LinkedIn';
    } else if (key === 'websites') {
      label =
        host === 'leetcode.com'
          ? 'LeetCode'
          : host === 'codeforces.com'
            ? 'Codeforces'
            : host.replace(/\.(?:workers\.dev|vercel\.app|netlify\.app|pages\.dev)$/, '');
    }
    const href =
      ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    return { label: label || 'Website', kind, href };
  } catch {
    return { label: key === 'websites' ? 'Website' : key, kind: 'globe', href: '' };
  }
}

/** Read-only profile presentation. Copy always uses the complete saved value. */
export function mountProfileView(
  profile: ApplicantProfile,
  downloadResume: (saved: ApplicantProfile['resumeData']) => void,
): { element: HTMLElement; dispose(): void } {
  const stack = el('div', 'profile-cards'),
    status = el('p', 'profile-copy-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>(),
    previews = new Map<HTMLElement, HTMLButtonElement>();
  let disposed = false;
  function copy(label: string, value: string, cls = '', display = value): HTMLButtonElement {
    const answer = button(`copy-value ${cls}`, display || 'Not set');
    answer.disabled = !value;
    answer.title = `Copy ${label}`;
    answer.setAttribute('aria-label', `Copy ${label}`);
    answer.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(value);
        if (disposed) return;
        status.textContent = `${label} copied`;
        answer.dataset.copied = 'true';
        clearTimeout(timers.get(answer));
        timers.set(
          answer,
          setTimeout(() => {
            delete answer.dataset.copied;
            timers.delete(answer);
          }, 1200),
        );
      } catch {
        if (!disposed) status.textContent = `Could not copy ${label}. Try again.`;
      }
    });
    return answer;
  }
  function row(label: string, value: string): HTMLElement {
    const row = el('div', 'profile-value');
    row.append(el('span', '', label), copy(label, value));
    return row;
  }
  function section(title: string, kind: Icon): HTMLElement {
    const card = el('section', 'card'),
      header = el('div', 'profile-section-heading'),
      heading = el('h2', '', title),
      edit = el('a', 'profile-edit');
    heading.prepend(icon(kind));
    edit.href = chrome.runtime.getURL('options.html#/profile');
    edit.target = '_blank';
    edit.rel = 'noopener';
    edit.title = `Edit ${title.toLowerCase()}`;
    edit.setAttribute('aria-label', edit.title);
    edit.append(icon('edit'));
    header.append(heading, edit);
    card.append(header);
    stack.append(card);
    return card;
  }
  function metadata(parent: HTMLElement, label: string, value: string, kind: Icon): void {
    if (!value) return;
    const item = copy(label, value, 'history-meta-value');
    item.prepend(icon(kind));
    parent.append(item);
  }
  function measure(target: HTMLElement, toggle: HTMLButtonElement): void {
    if (toggle.getAttribute('aria-expanded') === 'true') return;
    // Wait for a real layout before deciding whether a description needs expansion.
    toggle.hidden =
      target.clientHeight > 0
        ? target.scrollHeight <= target.clientHeight + 1
        : (target.textContent || '').length < 240 &&
          (target.textContent || '').split('\n').length <= 3;
  }
  const observer =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            const toggle = previews.get(entry.target as HTMLElement);
            if (toggle) measure(entry.target as HTMLElement, toggle);
          }
        });
  function description(parent: HTMLElement, label: string, text: string): void {
    if (!text) return;
    const block = el('div', 'history-description'),
      answer = copy(`${label} description`, text, 'history-preview'),
      toggle = button('history-expand', 'Show more');
    answer.id = `profile-description-${previews.size}`;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', answer.id);
    toggle.setAttribute('aria-label', `Show more about ${label}`);
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', `${expanded ? 'Show less' : 'Show more'} about ${label}`);
      toggle.textContent = expanded ? 'Show less' : 'Show more';
      answer.classList.toggle('is-expanded', expanded);
      if (!expanded) measure(answer, toggle);
    });
    block.append(answer, toggle);
    parent.append(block);
    previews.set(answer, toggle);
    observer?.observe(answer);
    measure(answer, toggle);
  }
  const personal = section('Personal Details', 'person'),
    names = profile.nameData,
    contact = profile.contactData,
    address = profile.addressData;
  const street = [address.line1, address.line2].map(string).filter(Boolean).join(', '),
    locality = [
      ...new Set(
        [address.city, address.state, address.postalCode, address.country]
          .map(string)
          .filter(Boolean),
      ),
    ].join(' ');
  for (const [label, value] of [
    ['Legal Name', [names.firstName, names.middleName, names.lastName].filter(Boolean).join(' ')],
    ['Email', string(contact.email)],
    ['Phone', string(contact.phoneNumber)],
    ['Address', [street, locality].filter(Boolean).join('\n')],
  ])
    personal.append(row(label, value));
  if (profile.languageData.length)
    personal.append(
      row(
        'Languages',
        profile.languageData
          .map((item) =>
            [string(item.language), string(item.proficiency)].filter(Boolean).join(' · '),
          )
          .join('\n'),
      ),
    );

  for (const [title, items, kind, primary] of [
    ['Work History', profile.jobData, 'work', 'jobTitle'],
    ['Education', profile.educationData, 'education', 'school'],
  ] as const) {
    const card = section(title, kind);
    if (!items.length) card.append(el('p', 'muted profile-empty', 'Add this in your profile.'));
    for (const item of items) {
      const entry = el('article', 'history-summary'),
        heading = el('h3', 'history-title'),
        label = string(item[primary]) || title,
        meta = el('div', 'history-meta');
      heading.append(copy(label, string(item[primary]), 'history-title-value', label));
      entry.append(heading);
      if (kind === 'work') {
        metadata(meta, `${label} company`, string(item.company), 'work');
        metadata(meta, `${label} location`, string(item.location), 'location');
      } else {
        metadata(meta, `${label} degree`, string(item.degree), 'education');
        metadata(meta, `${label} field of study`, string(item.fieldOfStudy), 'portfolio');
      }
      const dates = [
        prettyDate(item.startDate),
        item.currentlyWorkHere === true ? 'Present' : prettyDate(item.endDate),
      ]
        .filter(Boolean)
        .join(' – ');
      metadata(meta, `${label} dates`, dates, 'calendar');
      entry.append(meta);
      description(entry, label, string(item.description));
      card.append(entry);
    }
  }
  const portfolio = section('Portfolio', 'portfolio'),
    saved = profile.resumeData,
    fileName = string(saved.fileName);
  if (fileName) {
    const resume = el('div', 'profile-resume'),
      name = el('strong', 'profile-resume-name', fileName),
      details = el('p', 'muted profile-resume-meta'),
      actions = el('div', 'profile-resume-actions'),
      download = button('quiet-button', 'Download'),
      replace = el('a', 'quiet-button', 'Replace');
    name.title = fileName;
    const size =
      typeof saved.fileSize === 'number' && saved.fileSize > 0
        ? `${Math.round(saved.fileSize)} KB`
        : '';
    details.textContent = [
      size,
      string(saved.dateUploaded)
        ? `Uploaded ${prettyDate(string(saved.dateUploaded).split('T')[0])}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    download.prepend(icon('download'));
    download.disabled = !string(saved.resumeBase64);
    download.addEventListener('click', () => downloadResume(saved));
    replace.href = chrome.runtime.getURL('options.html#/profile');
    replace.target = '_blank';
    replace.rel = 'noopener';
    actions.append(download, replace);
    resume.append(name, details, actions);
    portfolio.append(resume);
  }
  const links = el('div', 'portfolio-links'),
    seen = new Set<string>();
  const primaryLinks = ['linkedin', 'github', 'personal'];
  const websites: [string, unknown][] = [
    ...primaryLinks.map((key): [string, unknown] => [key, profile.websiteData[key]]),
    ...Object.entries(profile.websiteData).filter(([key]) => !primaryLinks.includes(key)),
  ];
  for (const [key, values] of websites) {
    for (const value of Array.isArray(values) ? values : [values]) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const info = websiteInfo(value, key),
        identity = info.href || value;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const item = el('div', 'portfolio-link'),
        control = copy(`${info.label} URL`, value, 'portfolio-link-copy', '');
      control.replaceChildren(icon(info.kind), el('span', '', info.label));
      control.title = `Copy ${info.label}: ${value}`;
      item.append(control);
      if (info.href) {
        const open = el('a', 'portfolio-link-open');
        open.href = info.href;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        open.title = `Open ${info.label}`;
        open.setAttribute('aria-label', open.title);
        open.append(icon('open'));
        item.append(open);
      }
      links.append(item);
    }
  }
  if (links.childElementCount) portfolio.append(el('h3', 'profile-subheading', 'Links'), links);
  if (profile.skillsData.length) {
    const skills = el('div', 'profile-skills');
    for (const skill of profile.skillsData) skills.append(copy(skill, skill, 'profile-skill'));
    portfolio.append(el('h3', 'profile-subheading', 'Skills'), skills);
  }
  const employment = section('Employment Information', 'employment');
  for (const [key, value] of Object.entries(profile.employmentData)) {
    if (!['string', 'boolean', 'number'].includes(typeof value)) continue;
    const label = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
    employment.append(
      row(label, typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)),
    );
  }
  stack.append(status);
  return {
    element: stack,
    dispose() {
      disposed = true;
      observer?.disconnect();
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}
