// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { utcDayKey, utcDayOffset, utcDayStart, watchUtcDay } from '../src/application-day';

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
});

describe('UTC application days', () => {
  it.each([
    ['2026-11-02T00:00:00+05:30', '2026-11-01'],
    ['2026-11-02T05:29:59.999+05:30', '2026-11-01'],
    ['2026-11-02T05:30:00+05:30', '2026-11-02'],
    ['2026-11-01T23:59:59-07:00', '2026-11-02'],
    ['2027-01-01T00:00:00+05:30', '2026-12-31'],
    ['2024-03-01T05:29:59+05:30', '2024-02-29'],
  ])('assigns %s to %s regardless of the computer’s time zone', (input, day) => {
    expect(utcDayKey(new Date(input))).toBe(day);
    expect(new Date(utcDayStart(new Date(input))).toISOString()).toBe(`${day}T00:00:00.000Z`);
  });

  it('uses 24-hour UTC days across daylight-saving changes and calendar boundaries', () => {
    expect(utcDayOffset(new Date('2026-03-08T23:00:00-07:00'), -1).toISOString()).toBe(
      '2026-03-08T00:00:00.000Z',
    );
    expect(utcDayOffset(new Date('2024-03-01T00:00:00Z'), -1).toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
    expect(utcDayOffset(new Date('2026-12-31T23:59:59Z'), 1).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });

  it('does not reset at midnight IST; refreshes once at exactly 5:30 a.m. IST each day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T23:59:59.999+05:30'));
    const changed = vi.fn();
    stop = watchUtcDay(changed);
    vi.advanceTimersByTime(1);
    expect(changed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5.5 * 60 * 60 * 1000 - 1);
    expect(changed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(changed).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    expect(changed).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('catches up after sleep or a clock change and removes its timer and listeners on disposal', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T23:00:00Z'));
    const changed = vi.fn();
    stop = watchUtcDay(changed);
    vi.setSystemTime(new Date('2026-11-04T10:00:00Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(changed).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
    window.dispatchEvent(new Event('focus'));
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(new Date('2026-11-06T10:00:00Z'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(changed).toHaveBeenCalledTimes(2);
  });
});
