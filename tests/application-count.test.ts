// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applicationCount,
  countAdjustments,
  mountApplicationCount,
} from '../src/application-count';
import { utcDayKey } from '../src/application-day';
import { APPLICATION_COUNTS_KEY } from '../src/types';

describe('daily application-count corrections', () => {
  it('counts the UTC calendar day, excludes dates outside it, and adds only today’s correction', () => {
    const now = new Date('2026-10-29T10:00:00Z'),
      day = utcDayKey(now);
    const applications = [
      { date: '2026-10-29T00:00:00Z' },
      { date: '2026-10-29T23:59:59.999Z' },
      { date: '2026-10-28T23:59:59.999Z' },
      { date: '2026-10-30T00:00:00Z' },
      { date: 'invalid' },
      {},
    ];
    expect(applicationCount(applications, { [day]: 3, '2026-10-28': 50 }, now)).toBe(5);
    expect(applicationCount(applications, { [day]: -50 }, now)).toBe(0);
    expect(applicationCount(applications, { [day]: 3 }, new Date('2026-10-30T01:00:00Z'))).toBe(1);
  });
  it('keeps early-morning IST applications in the preceding UTC day until 5:30 a.m.', () => {
    const applications = [
      { date: '2026-11-01T23:59:59+05:30' },
      { date: '2026-11-02T00:00:00+05:30' },
      { date: '2026-11-02T05:29:59.999+05:30' },
    ];
    const corrections = { '2026-11-01': 2 };
    expect(
      applicationCount(applications, corrections, new Date('2026-11-02T05:29:59.999+05:30')),
    ).toBe(5);
    expect(applicationCount(applications, corrections, new Date('2026-11-02T05:30:00+05:30'))).toBe(
      0,
    );
    applications.push({ date: '2026-11-02T05:30:00+05:30' });
    expect(applicationCount(applications, corrections, new Date('2026-11-02T05:30:00+05:30'))).toBe(
      1,
    );
  });
  it('ignores malformed count storage rather than coercing strings or unsafe numbers', () => {
    expect(
      countAdjustments({
        '2026-10-29': 2,
        '2026-10-28': -1,
        bad: 5,
        '2026-10-27': '2',
        '2026-10-26': Infinity,
        '2026-10-25': 0.5,
        '2026-02-29': 7,
        '2026-13-01': 9,
      }),
    ).toEqual({ '2026-10-29': 2, '2026-10-28': -1 });
    expect(countAdjustments(null)).toEqual({});
    expect(countAdjustments([])).toEqual({});
  });
});

let cleanup: (() => void) | undefined, data: Record<string, unknown>;
type Listener = Parameters<typeof chrome.storage.onChanged.addListener>[0];
const listeners = new Set<Listener>();
const minus = () =>
  document.querySelector<HTMLButtonElement>('[aria-label="Decrease today’s application count"]')!;
const plus = () =>
  document.querySelector<HTMLButtonElement>('[aria-label="Increase today’s application count"]')!;
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
beforeEach(() => {
  data = { appliedList: [] };
  listeners.clear();
  document.body.innerHTML =
    '<div id="root"><h1>0 Applications <span>out of 10 today</span></h1></div>';
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn(async (message: { delta: number }) => {
        data[APPLICATION_COUNTS_KEY] = {
          [utcDayKey()]: Math.max(
            0,
            applicationCount(data.appliedList, data[APPLICATION_COUNTS_KEY]) + message.delta,
          ),
        };
        listeners.forEach((fn) =>
          fn({ [APPLICATION_COUNTS_KEY]: { newValue: data[APPLICATION_COUNTS_KEY] } }, 'local'),
        );
        return {
          ok: true,
          count: applicationCount(data.appliedList, data[APPLICATION_COUNTS_KEY]),
        };
      }),
    },
    storage: {
      local: { get: vi.fn(async () => data) },
      onChanged: {
        addListener: (fn: Listener) => listeners.add(fn),
        removeListener: (fn: Listener) => listeners.delete(fn),
      },
    },
  });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
describe('native count controls', () => {
  it('resets the open controls at UTC midnight and sends new-day corrections with the UTC date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T05:29:59.999+05:30'));
    data[APPLICATION_COUNTS_KEY] = { '2026-11-01': 2 };
    cleanup = mountApplicationCount().dispose;
    await vi.advanceTimersByTimeAsync(0);
    expect(minus().disabled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(minus().disabled).toBe(true);
    plus().click();
    await vi.advanceTimersByTimeAsync(0);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'eze-custom:adjust-count',
      delta: 1,
      day: '2026-11-02',
    });
  });
  it('adds one pair of buttons beside the daily heading and saves corrections without changing the list', async () => {
    const view = mountApplicationCount();
    cleanup = view.dispose;
    view.decorate();
    await settle();
    expect(document.querySelectorAll('.eze-count-controls')).toHaveLength(1);
    expect(minus().disabled).toBe(true);
    plus().click();
    await settle();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'eze-custom:adjust-count',
      delta: 1,
      day: utcDayKey(),
    });
    expect(data.appliedList).toEqual([]);
    expect(minus().disabled).toBe(false);
    minus().click();
    await settle();
    expect(minus().disabled).toBe(true);
  });
  it('restores the controls after a native rerender and follows another view’s count change', async () => {
    const view = mountApplicationCount();
    cleanup = view.dispose;
    await settle();
    document.querySelector('#root')!.innerHTML =
      '<h1>2 Applications <span>out of 10 today</span></h1>';
    view.decorate();
    data[APPLICATION_COUNTS_KEY] = { [utcDayKey()]: 2 };
    listeners.forEach((fn) =>
      fn({ [APPLICATION_COUNTS_KEY]: { newValue: data[APPLICATION_COUNTS_KEY] } }, 'local'),
    );
    await settle();
    expect(document.querySelectorAll('.eze-count-controls')).toHaveLength(1);
    expect(minus().disabled).toBe(false);
  });
  it('reports a rejected correction and leaves the saved count intact', async () => {
    const view = mountApplicationCount();
    cleanup = view.dispose;
    await settle();
    vi.mocked(chrome.runtime.sendMessage).mockImplementationOnce(async () => ({
      error: 'Could not update the count.',
    }));
    plus().click();
    await settle();
    expect(document.querySelector('.eze-count-status')?.textContent).toContain('Could not update');
    expect(data[APPLICATION_COUNTS_KEY]).toBeUndefined();
    expect(plus().disabled).toBe(false);
  });
});
