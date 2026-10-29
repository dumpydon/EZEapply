import { analyticsSummary, localDayKey } from './tracking-model';
import {
  TRACKING_CACHE_KEY,
  type ApplicationRecord,
  type ApplicationSource,
  type TrackingSnapshot,
  type AnalyticsSummary,
} from './tracking-types';
import { APPLICATION_COUNTS_KEY } from './types';

const SOURCE_LABELS: Record<ApplicationSource, string> = {
  linkedin: 'LinkedIn Easy Apply',
  external: 'External forms',
  unknown: 'Imported / unclassified',
};
const integer = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const dateLabel = (
  day: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
) => new Intl.DateTimeFormat(undefined, options).format(new Date(`${day}T12:00:00`));
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}
function button(text: string, className = 'quiet-button'): HTMLButtonElement {
  const el = element('button', className, text);
  el.type = 'button';
  return el;
}
function safeURL(value: string): string {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}
function sourceDot(source: ApplicationSource): HTMLElement {
  const dot = element('i', `source-dot ${source}`);
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}
function sourceLabel(source: ApplicationSource): HTMLElement {
  const label = element('span', 'source-label');
  label.append(sourceDot(source), document.createTextNode(SOURCE_LABELS[source]));
  return label;
}
function svgIcon(kind: 'chart' | 'arrow'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of kind === 'chart'
    ? ['M4 4v16h16', 'M8 15v-4', 'M13 15V6', 'M18 15V9']
    : ['M5 12h14', 'm13 6 6 6-6 6']) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
function recordsInPeriod(
  snapshot: TrackingSnapshot,
  summary: AnalyticsSummary,
): ApplicationRecord[] {
  const first = summary.bins[0]?.day,
    last = summary.bins.at(-1)?.day;
  if (!first || !last) return [];
  return snapshot.records
    .filter((record) => {
      const date = new Date(record.submittedAt);
      if (!Number.isFinite(date.getTime())) return false;
      const day = localDayKey(date);
      return day >= first && day <= last;
    })
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}
function publicRecord(record: ApplicationRecord) {
  return {
    id: record.id,
    source: record.source,
    jobTitle: record.jobTitle,
    company: record.company,
    url: safeURL(record.url),
    submittedAt: record.submittedAt,
    status: record.status,
    evidence: record.evidence,
  };
}
function csvCell(value: unknown): string {
  let text = String(value ?? '').replace(/\0/g, '');
  // Spreadsheet programs can execute cells beginning with formula characters.
  if (/^[\s]*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
/** Export only application metadata. Provider keys and applicant facts are never read. */
export function exportAnalytics(
  snapshot: TrackingSnapshot,
  days: number,
  format: 'csv' | 'json',
  now = new Date(),
): string {
  const summary = analyticsSummary(snapshot, days, now),
    records = recordsInPeriod(snapshot, summary).map(publicRecord);
  if (format === 'json')
    return JSON.stringify(
      {
        version: 1,
        exportedAt: now.toISOString(),
        period: { days, from: summary.bins[0]?.day, to: summary.bins.at(-1)?.day },
        records,
        daily: summary.bins,
      },
      null,
      2,
    );
  const rows: unknown[][] = [
    ['Date', 'Source', 'Job title', 'Company', 'Status', 'Evidence', 'URL', 'Count adjustment'],
  ];
  for (const record of records)
    rows.push([
      record.submittedAt,
      SOURCE_LABELS[record.source],
      record.jobTitle,
      record.company,
      record.status,
      record.evidence,
      record.url,
      '',
    ]);
  for (const bin of summary.bins)
    if (bin.adjustment)
      rows.push([
        bin.day,
        'Unclassified manual correction',
        '',
        '',
        'correction',
        'Daily counter correction',
        '',
        bin.adjustment,
      ]);
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function mountAnalytics(host: HTMLElement): () => void {
  host.className = 'analytics-app';
  let snapshot: TrackingSnapshot | undefined,
    days = 7,
    disposed = false,
    revision = 0,
    visibleRecords = 12,
    source: 'all' | ApplicationSource = 'all';
  let refreshTimer: ReturnType<typeof setTimeout> | undefined,
    lastDay = localDayKey();
  const top = element('header', 'topbar'),
    brand = element('a', 'brand');
  brand.href = chrome.runtime.getURL('options.html#/');
  const logo = element('img');
  logo.src = chrome.runtime.getURL('custom/wordmark.svg');
  logo.alt = 'EZEapply';
  brand.append(logo);
  const nav = element('nav', 'top-nav');
  nav.setAttribute('aria-label', 'EZEapply');
  const applications = element('a', 'nav-link', 'Applications');
  applications.href = chrome.runtime.getURL('options.html#/');
  const current = element('span', 'nav-current', 'Analytics');
  current.setAttribute('aria-current', 'page');
  nav.append(applications, current);
  top.append(brand, nav);
  const main = element('main', 'analytics-main'),
    intro = element('section', 'intro'),
    introCopy = element('div');
  introCopy.append(
    element('div', 'eyebrow', 'YOUR JOB SEARCH'),
    element('h1', '', 'Application activity'),
    element('p', 'intro-text', 'Track your pace across LinkedIn and company application forms.'),
  );
  const goalBox = element('div', 'goal-box'),
    goalButton = button('Daily goal', 'goal-trigger');
  goalButton.setAttribute('aria-expanded', 'false');
  goalButton.setAttribute('aria-controls', 'daily-goal-editor');
  const goalForm = element('form', 'goal-editor');
  goalForm.id = 'daily-goal-editor';
  goalForm.hidden = true;
  const goalLabel = element('label', '', 'Applications per day'),
    goalInput = element('input');
  goalInput.id = 'daily-goal-value';
  goalInput.type = 'number';
  goalInput.min = '1';
  goalInput.max = '10000';
  goalInput.step = '1';
  goalInput.required = true;
  goalLabel.htmlFor = goalInput.id;
  const saveGoal = button('Save goal', 'primary-button');
  saveGoal.type = 'submit';
  const cancelGoal = button('Cancel');
  const goalActions = element('div', 'goal-actions');
  goalActions.append(cancelGoal, saveGoal);
  goalForm.append(goalLabel, goalInput, goalActions);
  goalBox.append(goalButton, goalForm);
  intro.append(introCopy, goalBox);
  const notice = element('div', 'page-notice');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.hidden = true;
  const tools = element('div', 'period-toolbar'),
    range = element('div', 'range-picker');
  range.setAttribute('role', 'group');
  range.setAttribute('aria-label', 'Analytics period');
  const rangeButtons = new Map<number, HTMLButtonElement>();
  for (const count of [7, 15, 30]) {
    const control = button(`${count} days`, 'range-button');
    control.setAttribute('aria-pressed', String(count === days));
    control.addEventListener('click', () => {
      days = count;
      visibleRecords = 12;
      render();
    });
    rangeButtons.set(count, control);
    range.append(control);
  }
  const exports = element('div', 'export-tools'),
    refreshButton = button('Refresh');
  refreshButton.setAttribute('aria-label', 'Refresh analytics');
  const csv = button('Export CSV'),
    json = button('JSON');
  json.setAttribute('aria-label', 'Export analytics as JSON');
  exports.append(refreshButton, csv, json);
  tools.append(range, exports);
  const body = element('div', 'dashboard-body'),
    footer = element('footer', 'page-footer');
  footer.append(
    element('span', '', 'Saved on this device. No account or analytics service.'),
    element('span', '', 'Blue for LinkedIn. Teal for external forms.'),
  );
  main.append(intro, notice, tools, body, footer);
  host.replaceChildren(top, main);
  function feedback(message: string, error = false) {
    notice.textContent = message;
    notice.classList.toggle('error', error);
    notice.hidden = false;
  }
  async function rpc(type: string, extra: Record<string, unknown> = {}) {
    const result = await chrome.runtime.sendMessage({ type: `eze-tracking:${type}`, ...extra });
    if (!result?.ok)
      throw new Error(
        result?.error || 'Could not reach EZEapply. Reload the extension and try again.',
      );
    return result;
  }
  function download(format: 'csv' | 'json') {
    if (!snapshot) return;
    const data = exportAnalytics(snapshot, days, format),
      blob = new Blob([data], {
        type: format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8',
      }),
      url = URL.createObjectURL(blob),
      link = element('a');
    link.href = url;
    link.download = `EZEapply-applications-${days}-days-${localDayKey()}.${format}`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    feedback(`Exported the selected ${days}-day period. Only application metadata is included.`);
  }
  csv.addEventListener('click', () => download('csv'));
  json.addEventListener('click', () => download('json'));
  goalButton.addEventListener('click', () => {
    goalForm.hidden = !goalForm.hidden;
    goalButton.setAttribute('aria-expanded', String(!goalForm.hidden));
    if (!goalForm.hidden) {
      goalInput.value = String(snapshot?.goal || 10);
      goalInput.focus();
      goalInput.select();
    }
  });
  cancelGoal.addEventListener('click', () => {
    goalForm.hidden = true;
    goalButton.setAttribute('aria-expanded', 'false');
    goalButton.focus();
  });
  goalForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const goal = Number(goalInput.value);
    if (!Number.isSafeInteger(goal) || goal < 1 || goal > 10000) {
      feedback('Choose a whole-number goal from 1 to 10,000.', true);
      goalInput.focus();
      return;
    }
    saveGoal.disabled = true;
    cancelGoal.disabled = true;
    try {
      await rpc('set-goal', { goal });
      await refresh();
      goalForm.hidden = true;
      goalButton.setAttribute('aria-expanded', 'false');
      goalButton.focus();
      feedback(`Daily goal updated to ${integer.format(goal)} applications.`);
    } catch (error) {
      feedback(error instanceof Error ? error.message : 'Could not save the goal.', true);
    } finally {
      if (!disposed) {
        saveGoal.disabled = false;
        cancelGoal.disabled = false;
      }
    }
  });
  function metric(label: string, value: string, note: string, className = '') {
    const card = element('article', `metric ${className}`);
    card.append(
      element('h2', 'metric-label', label),
      element('p', 'metric-value', value),
      element('p', 'metric-note', note),
    );
    return card;
  }
  function renderChart(summary: AnalyticsSummary): HTMLElement {
    const section = element('section', 'chart-card card'),
      heading = element('div', 'card-heading'),
      copy = element('div');
    copy.append(
      element('div', 'eyebrow', 'YOUR MOMENTUM'),
      element('h2', '', 'Daily applications'),
    );
    const dates = element(
      'span',
      'period-label',
      `${dateLabel(summary.bins[0].day)} — ${dateLabel(summary.bins.at(-1)!.day)}`,
    );
    heading.append(copy, dates);
    const legend = element('div', 'legend');
    for (const s of ['linkedin', 'external', 'unknown'] as const) legend.append(sourceLabel(s));
    const max = Math.max(
        1,
        ...summary.bins.map((bin) => bin.linkedin + bin.external + bin.unknown),
      ),
      ceiling = max <= 5 ? 5 : Math.ceil(max / 5) * 5;
    const chartWrap = element('div', 'chart-wrap'),
      axis = element('div', 'chart-axis');
    axis.setAttribute('aria-hidden', 'true');
    for (const value of [ceiling, ceiling / 2, 0])
      axis.append(element('span', '', decimal.format(value)));
    const plot = element('div', 'chart-plot'),
      grid = element('div', 'chart-grid');
    grid.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) grid.append(element('i'));
    const bars = element('div', 'chart-bars');
    bars.style.setProperty('--days', String(days));
    bars.setAttribute('role', 'group');
    bars.setAttribute('aria-label', `Daily recorded applications over ${days} days`);
    const detail = element('div', 'day-detail');
    detail.setAttribute('role', 'status');
    detail.textContent = 'Hover or focus a bar to see the day’s breakdown.';
    for (const [index, bin] of summary.bins.entries()) {
      const day = button('', 'day-column'),
        date = dateLabel(bin.day, { weekday: 'long', month: 'short', day: 'numeric' }),
        recorded = bin.linkedin + bin.external + bin.unknown;
      const description = `${date}: ${bin.total} total; ${bin.linkedin} LinkedIn Easy Apply, ${bin.external} external forms, ${bin.unknown} unclassified${bin.adjustment ? `; manual correction ${bin.adjustment > 0 ? '+' : ''}${bin.adjustment}` : ''}`;
      day.setAttribute('aria-label', description);
      day.title = description;
      const stack = element('span', 'bar-stack');
      stack.setAttribute('aria-hidden', 'true');
      for (const s of ['unknown', 'external', 'linkedin'] as const) {
        const segment = element('i', `bar-segment ${s}`);
        segment.style.height = `${(bin[s] / ceiling) * 100}%`;
        stack.append(segment);
      }
      if (!recorded) stack.append(element('i', 'bar-zero'));
      if (bin.adjustment) {
        const marker = element('span', 'correction-marker', bin.adjustment > 0 ? '+' : '−');
        marker.title = 'Manual count correction';
        stack.append(marker);
      }
      const label = element(
        'span',
        'day-label',
        days === 7
          ? dateLabel(bin.day, { weekday: 'short' })
          : index === 0 || index === summary.bins.length - 1 || index % 5 === 0
            ? dateLabel(bin.day, { day: 'numeric' })
            : '',
      );
      label.setAttribute('aria-hidden', 'true');
      day.append(stack, label);
      bars.append(day);
      const inspect = () => {
        detail.textContent = description;
      };
      day.addEventListener('focus', inspect);
      day.addEventListener('pointerenter', inspect);
      day.addEventListener('click', inspect);
    }
    plot.append(grid, bars);
    chartWrap.append(axis, plot);
    const chartNote = element(
      'p',
      'chart-note',
      'Bars show recorded submissions. + / − markers show manual corrections, which stay unclassified.',
    );
    const facts = element('div', 'chart-facts'),
      best = summary.bestDay;
    facts.append(
      element(
        'span',
        '',
        best && best.total > 0
          ? `Best day · ${dateLabel(best.day)} · ${integer.format(best.total)} applications`
          : 'Your best day is still ahead.',
      ),
      element('span', '', `${integer.format(summary.streak)}-day current streak`),
    );
    const tableDetails = element('details', 'data-table-details'),
      tableSummary = element('summary', '', 'View daily data');
    const table = element('table', 'daily-table'),
      caption = element('caption', 'sr-only', `Daily application data for the last ${days} days`),
      thead = element('thead'),
      tr = element('tr');
    for (const title of [
      'Date',
      'LinkedIn',
      'Forms',
      'Unclassified',
      'Correction',
      'Total',
      'Goal',
    ]) {
      const th = element('th', '', title);
      th.scope = 'col';
      tr.append(th);
    }
    thead.append(tr);
    const tbody = element('tbody');
    for (const bin of [...summary.bins].reverse()) {
      const row = element('tr');
      for (const value of [
        dateLabel(bin.day),
        bin.linkedin,
        bin.external,
        bin.unknown,
        bin.adjustment > 0 ? `+${bin.adjustment}` : bin.adjustment,
        bin.total,
        bin.goal,
      ])
        row.append(element('td', '', String(value)));
      tbody.append(row);
    }
    table.append(caption, thead, tbody);
    tableDetails.append(tableSummary, table);
    section.append(heading, legend, chartWrap, detail, chartNote, facts, tableDetails);
    return section;
  }
  function renderMix(summary: AnalyticsSummary): HTMLElement {
    const section = element('section', 'mix-card card');
    section.append(
      element('div', 'eyebrow', 'WHERE YOU APPLY'),
      element('h2', '', 'Application mix'),
    );
    const recorded = summary.linkedin + summary.external + summary.unknown,
      mix = element('div', 'mix-track');
    mix.setAttribute('role', 'img');
    mix.setAttribute(
      'aria-label',
      `${summary.linkedin} LinkedIn, ${summary.external} external forms, ${summary.unknown} unclassified`,
    );
    for (const source of ['linkedin', 'external', 'unknown'] as const) {
      const segment = element('i', `mix-segment ${source}`);
      segment.style.width = `${recorded ? (summary[source] / recorded) * 100 : 0}%`;
      mix.append(segment);
    }
    section.append(mix);
    for (const source of ['linkedin', 'external', 'unknown'] as const) {
      const row = element('div', 'mix-row');
      row.append(sourceLabel(source), element('strong', '', integer.format(summary[source])));
      section.append(row);
    }
    if (summary.adjustment) {
      const row = element('div', 'mix-row corrections');
      row.append(
        element('span', '', 'Manual corrections'),
        element(
          'strong',
          '',
          `${summary.adjustment > 0 ? '+' : ''}${integer.format(summary.adjustment)}`,
        ),
      );
      section.append(row);
    }
    const explanation = element('div', 'tracking-note');
    explanation.append(
      element('strong', '', 'Count what’s confirmed.'),
      element(
        'p',
        '',
        'New applications are recorded after a submission confirmation. Older entries without a known application method remain unclassified.',
      ),
    );
    section.append(explanation);
    return section;
  }
  function renderRecent(summary: AnalyticsSummary): HTMLElement {
    const section = element('section', 'recent-card card'),
      heading = element('div', 'card-heading'),
      copy = element('div');
    copy.append(
      element('div', 'eyebrow', 'YOUR APPLICATION JOURNAL'),
      element('h2', '', 'Recent submissions'),
    );
    const all = recordsInPeriod(snapshot!, summary),
      count = element(
        'span',
        'period-label',
        `${integer.format(all.length)} recorded in this period`,
      );
    heading.append(copy, count);
    section.append(heading);
    const filters = element('div', 'recent-filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Filter recent submissions');
    for (const [key, label] of [
      ['all', 'All'],
      ['linkedin', 'LinkedIn'],
      ['external', 'Forms'],
      ['unknown', 'Unclassified'],
    ] as const) {
      const control = button(label, 'filter-button');
      control.setAttribute('aria-pressed', String(source === key));
      control.addEventListener('click', () => {
        source = key;
        visibleRecords = 12;
        section.replaceWith(renderRecent(summary));
      });
      filters.append(control);
    }
    section.append(filters);
    const filtered = all.filter((record) => source === 'all' || record.source === source),
      list = element('ol', 'submission-list');
    for (const record of filtered.slice(0, visibleRecords)) {
      const row = element('li', 'submission-row'),
        icon = element('span', `submission-icon ${record.source}`);
      icon.append(svgIcon(record.source === 'linkedin' ? 'arrow' : 'chart'));
      const text = element('div', 'submission-copy'),
        url = safeURL(record.url);
      let title: HTMLElement;
      if (url) {
        const link = element('a', 'submission-title', record.jobTitle || 'Job application');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        title = link;
      } else title = element('strong', 'submission-title', record.jobTitle || 'Job application');
      const meta = element('div', 'submission-meta');
      meta.append(
        element('span', '', record.company || 'Company not recorded'),
        sourceLabel(record.source),
      );
      text.append(title, meta);
      const evidence = element('details', 'submission-evidence');
      evidence.append(
        element(
          'summary',
          '',
          record.status === 'imported'
            ? 'Imported record'
            : record.status === 'manual'
              ? 'Manually recorded'
              : 'Submission confirmed',
        ),
        element('p', '', record.evidence || 'No additional confirmation details.'),
      );
      text.append(evidence);
      const date = element(
        'time',
        'submission-date',
        new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(record.submittedAt)),
      );
      date.dateTime = record.submittedAt;
      row.append(icon, text, date);
      list.append(row);
    }
    if (!filtered.length) {
      const empty = element('div', 'empty-journal');
      empty.append(
        element(
          'strong',
          '',
          all.length
            ? 'No submissions from this source yet.'
            : 'Your next application starts the story.',
        ),
        element(
          'p',
          '',
          all.length
            ? 'Try another filter to see the rest of this period.'
            : 'Confirmed job applications will appear here automatically. Older saved applications appear when available.',
        ),
      );
      section.append(empty);
    } else section.append(list);
    if (filtered.length > visibleRecords) {
      const more = button(
        `Show more (${integer.format(filtered.length - visibleRecords)} remaining)`,
        'load-more',
      );
      more.addEventListener('click', () => {
        visibleRecords += 12;
        section.replaceWith(renderRecent(summary));
      });
      section.append(more);
    }
    return section;
  }
  function render() {
    if (!snapshot) return;
    const summary = analyticsSummary(snapshot, days),
      metrics = element('section', 'metrics');
    metrics.setAttribute('aria-label', 'Application summary');
    for (const [count, control] of rangeButtons)
      control.setAttribute('aria-pressed', String(count === days));
    goalButton.replaceChildren(
      element('span', 'goal-kicker', 'DAILY GOAL'),
      element('strong', '', `${integer.format(snapshot.goal)} applications`),
      element('span', 'goal-edit', 'Edit goal ↗'),
    );
    const growth =
      summary.growth === null
        ? summary.total > 0
          ? 'New activity'
          : '—'
        : `${summary.growth > 0 ? '+' : ''}${decimal.format(summary.growth)}%`;
    const goalDays = summary.bins.filter((bin) => bin.goal > 0).length;
    metrics.append(
      metric(
        'Applications',
        integer.format(summary.total),
        `${integer.format(summary.previousTotal)} in the previous ${days} days`,
        'primary-metric',
      ),
      metric(
        'Period growth',
        growth,
        summary.growth === null
          ? summary.total > 0
            ? 'Previous period had no applications.'
            : 'No applications in either period.'
          : `Compared with the previous ${days} days`,
        summary.growth !== null && summary.growth < 0 ? 'negative' : 'positive',
      ),
      metric(
        'Daily average',
        decimal.format(summary.total / days),
        `Across the selected ${days}-day period`,
      ),
      metric(
        'Goals reached',
        `${summary.goalDays} / ${goalDays}`,
        goalDays
          ? `${decimal.format(summary.goalAttainment)}% of days with a saved goal`
          : 'Goal history starts when tracking is enabled.',
      ),
    );
    const grid = element('div', 'dashboard-grid');
    grid.append(renderChart(summary), renderMix(summary));
    body.replaceChildren(metrics, grid, renderRecent(summary));
    csv.disabled = false;
    json.disabled = false;
  }
  async function refresh() {
    const request = ++revision;
    refreshButton.disabled = true;
    host.setAttribute('aria-busy', 'true');
    if (!snapshot) {
      const state = element('section', 'loading-card');
      state.append(
        element('div', 'loading-line'),
        element('h2', '', 'Gathering your application history…'),
        element('p', '', 'Everything stays on this device.'),
      );
      body.replaceChildren(state);
      csv.disabled = true;
      json.disabled = true;
      goalButton.disabled = true;
    }
    try {
      const result = await rpc('snapshot');
      if (disposed || request !== revision) return;
      if (
        !result.snapshot ||
        !Array.isArray(result.snapshot.records) ||
        !Number.isSafeInteger(result.snapshot.goal)
      )
        throw new Error('Application history could not be read. Refresh to try again.');
      snapshot = result.snapshot as TrackingSnapshot;
      goalButton.disabled = false;
      notice.hidden = true;
      render();
    } catch (error) {
      if (!disposed && request === revision) {
        feedback(error instanceof Error ? error.message : 'Could not load analytics.', true);
        if (!snapshot) {
          const empty = element('section', 'loading-card');
          empty.append(
            element('h2', '', 'Your history is safe. Let’s reconnect.'),
            element('p', '', 'Use Refresh to try again, or reload EZEapply in Chrome.'),
          );
          body.replaceChildren(empty);
        }
      }
    } finally {
      if (!disposed && request === revision) {
        refreshButton.disabled = false;
        host.setAttribute('aria-busy', 'false');
      }
    }
  }
  refreshButton.addEventListener('click', () => void refresh());
  const changed: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (
      area !== 'local' ||
      disposed ||
      ![TRACKING_CACHE_KEY, APPLICATION_COUNTS_KEY, 'dailyGoal'].some((key) => changes[key])
    )
      return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void refresh(), 80);
  };
  chrome.storage.onChanged.addListener(changed);
  const rollover = setInterval(() => {
    const current = localDayKey();
    if (current !== lastDay) {
      lastDay = current;
      void refresh();
    }
  }, 60000);
  void refresh();
  return () => {
    disposed = true;
    revision++;
    clearTimeout(refreshTimer);
    clearInterval(rollover);
    chrome.storage.onChanged.removeListener(changed);
  };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.id && typeof document !== 'undefined') {
  const host = document.getElementById('eze-analytics');
  if (host) mountAnalytics(host);
}
