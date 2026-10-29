import { APPLICATION_COUNTS_KEY } from './types';
import { localDayKey, validDay } from './tracking-model';
import { TRACKING_DAILY_TOTALS_KEY } from './tracking-types';

export { localDayKey as localDay } from './tracking-model';
const localDay = localDayKey;
export function countAdjustments(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([day, amount]) =>
        validDay(day) && Number.isSafeInteger(amount) && Math.abs(amount as number) <= 99999,
    ),
  );
}
export function applicationCount(
  appliedList: unknown,
  adjustments: unknown,
  now = new Date(),
): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const detected = Array.isArray(appliedList)
    ? appliedList.filter((item) => {
        if (!item || typeof item !== 'object' || typeof item.date !== 'string') return false;
        const date = new Date(item.date).getTime();
        return date >= start && date < end;
      }).length
    : 0;
  return Math.max(0, detected + (countAdjustments(adjustments)[localDay(now)] || 0));
}

/** The host view owns the count/ring/progress. This module adds compact controls. */
export function mountApplicationCount(): { decorate(): void; dispose(): void } {
  let disposed = false,
    busy = false,
    ready = false,
    revision = 0,
    total = 0;
  const controls = document.createElement('span');
  controls.className = 'eze-count-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Adjust today’s application count');
  const minus = document.createElement('button'),
    plus = document.createElement('button');
  for (const [button, label, sign] of [
    [minus, 'Decrease today’s application count', '−'],
    [plus, 'Increase today’s application count', '+'],
  ] as const) {
    button.type = 'button';
    button.className = 'eze-count-step';
    button.textContent = sign;
    button.setAttribute('aria-label', label);
    button.title = label;
  }
  controls.append(minus, plus);
  const status = document.createElement('span');
  status.className = 'eze-count-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  function render() {
    minus.disabled = !ready || busy || total === 0;
    plus.disabled = !ready || busy;
    controls.title = `Today: ${total}. Correct missed or extra counts manually.`;
  }
  async function refresh() {
    const request = ++revision;
    try {
      const data = await chrome.storage.local.get([
        'appliedList',
        APPLICATION_COUNTS_KEY,
        TRACKING_DAILY_TOTALS_KEY,
      ]);
      if (disposed || request !== revision) return;
      const cached = (
        data[TRACKING_DAILY_TOTALS_KEY] as Record<string, { total: number }> | undefined
      )?.[localDay()]?.total;
      total =
        typeof cached === 'number' && Number.isSafeInteger(cached) && cached >= 0
          ? cached
          : applicationCount(data.appliedList, data[APPLICATION_COUNTS_KEY]);
      ready = true;
      render();
    } catch {
      if (!disposed && request === revision) {
        ready = false;
        render();
        status.textContent = 'Could not load the application count.';
        status.hidden = false;
      }
    }
  }
  async function adjust(delta: number) {
    busy = true;
    status.hidden = true;
    render();
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'eze-custom:adjust-count',
        delta,
        day: localDay(),
      });
      if (!result?.ok) throw new Error(result?.error || 'Could not update the count. Try again.');
      if (!disposed) {
        await refresh();
        status.textContent = `Today’s application count: ${result.count}`;
        status.hidden = false;
      }
    } catch (error) {
      if (!disposed) {
        status.textContent = error instanceof Error ? error.message : 'Could not update the count.';
        status.hidden = false;
      }
    } finally {
      busy = false;
      if (!disposed) render();
    }
  }
  minus.addEventListener('click', () => void adjust(-1));
  plus.addEventListener('click', () => void adjust(1));
  const changed: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
    if (
      !disposed &&
      area === 'local' &&
      (changes.appliedList || changes[APPLICATION_COUNTS_KEY] || changes[TRACKING_DAILY_TOTALS_KEY])
    )
      void refresh();
  };
  chrome.storage.onChanged.addListener(changed);
  const rollover = setInterval(() => void refresh(), 60000);
  render();
  void refresh();
  function decorate() {
    if (disposed) return;
    const heading = [...document.querySelectorAll<HTMLHeadingElement>('#root h1')].find((node) =>
      /\bapplications?\b.*\btoday\b/i.test(node.textContent || ''),
    );
    const chart = location.pathname.endsWith('/popup.html')
      ? document.querySelector<HTMLElement>('#root [data-chart]')
      : null;
    const anchor = heading || chart;
    if (!anchor) return;
    anchor.classList.add('eze-count-anchor');
    if (controls.parentElement !== anchor) anchor.append(controls);
    if (anchor.nextElementSibling !== status) anchor.after(status);
  }
  decorate();
  return {
    decorate,
    dispose() {
      disposed = true;
      clearInterval(rollover);
      chrome.storage.onChanged.removeListener(changed);
      controls.remove();
      status.remove();
    },
  };
}
