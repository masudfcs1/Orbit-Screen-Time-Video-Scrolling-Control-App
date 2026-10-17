import { afterEach, describe, expect, it } from 'vitest';
import { aggregateRange, calculateSummary, deduplicateSessions, formatDuration, localDayBounds, localMonthBounds, localWeekBounds, monthDays, normalizeSessions } from '../src/domain/analytics';
import type { UsageSession } from '../src/domain/types';

const originalTimezone = process.env.TZ;
afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
});
const session = (id: string, appId: string, startedAt: number, endedAt: number): UsageSession => ({ id, appId, startedAt, endedAt });

describe('local usage analytics', () => {
  it('splits sessions at local midnight', () => {
    const start = new Date(2026, 9, 17, 23, 50).getTime();
    const end = new Date(2026, 9, 18, 0, 20).getTime();
    const sessions = [session('overnight', 'youtube', start, end)];
    expect(calculateSummary(sessions, start).totalMinutes).toBe(10);
    expect(calculateSummary(sessions, end).totalMinutes).toBe(20);
    expect(calculateSummary(sessions, end).previousDayMinutes).toBe(10);
  });

  it('keeps the longest update for a polling ID and deduplicates equivalent intervals', () => {
    expect(deduplicateSessions([
      session('a', 'youtube', 0, 60_000), session('a', 'youtube', 0, 120_000),
      session('duplicate', 'youtube', 0, 120_000),
    ])).toHaveLength(1);
    expect(aggregateRange([session('a', 'youtube', 0, 60_000), session('a', 'youtube', 0, 120_000)], 0, 180_000).totalMinutes).toBe(2);
  });

  it('attributes overlaps to the latest foreground app without double counting', () => {
    const sessions = [session('a', 'youtube', 0, 10 * 60_000), session('b', 'instagram', 2 * 60_000, 6 * 60_000), session('c', 'tiktok', 4 * 60_000, 8 * 60_000)];
    const summary = aggregateRange(sessions, 0, 10 * 60_000);
    expect(summary).toMatchObject({ totalMinutes: 10, sessionCount: 3, appMinutes: { youtube: 4, instagram: 2, tiktok: 4 } });
    expect(Object.values(summary.appMinutes).reduce((a, b) => a + b, 0)).toBe(summary.totalMinutes);
    expect(normalizeSessions(sessions)).toEqual(normalizeSessions([...sessions].reverse()));
  });

  it('ignores empty intervals and clips a custom range', () => {
    expect(aggregateRange([session('a', 'youtube', 0, 0), session('b', 'youtube', 0, 180_000)], 60_000, 120_000)).toMatchObject({ totalMinutes: 1, sessionCount: 1 });
    expect(calculateSummary([], Date.now()).sessionCount).toBe(0);
    expect(formatDuration(142)).toBe('2h 22m');
    expect(formatDuration(-5)).toBe('0m');
  });

  it('handles imported IDs that match JavaScript object property names', () => {
    expect(aggregateRange([session('a', '__proto__', 0, 60_000)], 0, 60_000).appMinutes['__proto__']).toBe(1);
    expect(aggregateRange([session('b', 'constructor', 0, 60_000)], 0, 60_000).appMinutes['constructor']).toBe(1);
  });

  it('uses Monday–Sunday calendar weeks and actual month length', () => {
    const timestamp = new Date(2026, 9, 18, 12).getTime();
    const [start, end] = localWeekBounds(timestamp);
    expect(new Date(start).getDay()).toBe(1);
    expect(new Date(end).getDate()).toBe(19);
    expect(calculateSummary([], timestamp).weekDays.map((day) => day.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(monthDays([], new Date(2024, 1, 10).getTime())).toHaveLength(29);
    const [monthStart, monthEnd] = localMonthBounds(new Date(2026, 11, 14).getTime());
    expect(new Date(monthStart).getMonth()).toBe(11);
    expect(new Date(monthEnd).getFullYear()).toBe(2027);
  });

  it('handles daylight-saving days without assuming 24 hours', () => {
    process.env.TZ = 'America/New_York';
    const [springStart, springEnd] = localDayBounds(new Date(2026, 2, 8, 12).getTime());
    const [fallStart, fallEnd] = localDayBounds(new Date(2026, 10, 1, 12).getTime());
    expect((springEnd - springStart) / 3_600_000).toBe(23);
    expect((fallEnd - fallStart) / 3_600_000).toBe(25);
  });

  it('recalculates day boundaries after a timezone change', () => {
    const timestamp = Date.UTC(2026, 9, 17, 23, 30);
    process.env.TZ = 'Asia/Dhaka';
    expect(new Date(localDayBounds(timestamp)[0]).getDate()).toBe(18);
    process.env.TZ = 'America/Los_Angeles';
    expect(new Date(localDayBounds(timestamp)[0]).getDate()).toBe(17);
  });
});
