import { describe, expect, it } from 'vitest';
import { createFocus } from '../src/domain/countdown';
import { isScheduleActive, nextScheduleStart, restrictionReasons, schedulesOverlap, scheduleWindow, validateSchedule } from '../src/domain/schedules';
import type { Schedule } from '../src/domain/types';

const overnight: Schedule = { id: 'night', name: 'Sleep', startTime: '22:00', endTime: '07:00', days: [1], appIds: ['youtube'], enabled: true };

describe('recurring restrictions', () => {
  it('carries overnight schedules into the following weekday and uses an exclusive end', () => {
    expect(isScheduleActive(overnight, new Date(2026, 9, 19, 22).getTime())).toBe(true);
    expect(isScheduleActive(overnight, new Date(2026, 9, 20, 6, 59).getTime())).toBe(true);
    expect(isScheduleActive(overnight, new Date(2026, 9, 20, 7).getTime())).toBe(false);
    expect(isScheduleActive(overnight, new Date(2026, 9, 20, 22).getTime())).toBe(false);
  });

  it('finds the next scheduled start and ignores disabled schedules', () => {
    const now = new Date(2026, 9, 20, 12).getTime();
    expect(nextScheduleStart(overnight, now)).toBe(new Date(2026, 9, 26, 22).getTime());
    expect(nextScheduleStart({ ...overnight, enabled: false }, now)).toBeNull();
  });

  it('detects overlaps across the weekly boundary only for shared apps', () => {
    const sunday = { ...overnight, days: [0] };
    const monday = { ...overnight, id: 'morning', startTime: '06:00', endTime: '09:00' };
    expect(schedulesOverlap(sunday, monday)).toBe(true);
    expect(schedulesOverlap(sunday, { ...monday, startTime: '07:00' })).toBe(false);
    expect(schedulesOverlap(sunday, { ...monday, appIds: ['instagram'] })).toBe(false);
  });

  it('combines restrictions so cancelling focus does not bypass a daily limit', () => {
    const now = new Date(2026, 9, 19, 23).getTime();
    const limit = { id: 'daily', appId: 'youtube', minutes: 45, enabled: true };
    const focus = createFocus(30, ['youtube'], now);
    expect(restrictionReasons('youtube', [limit], [overnight], focus, 50, now)).toEqual(['Daily allowance reached', 'Sleep', 'Focus session']);
    expect(restrictionReasons('youtube', [limit], [overnight], { ...focus, status: 'cancelled' }, 50, now)).toEqual(['Daily allowance reached', 'Sleep']);
  });

  it('rejects ambiguous zero-length schedules and malformed weekdays', () => {
    expect(() => validateSchedule({ ...overnight, endTime: '22:00' })).toThrow();
    expect(() => validateSchedule({ ...overnight, days: [1.5] })).toThrow();
    expect(() => validateSchedule({ ...overnight, startTime: '25:00' })).toThrow();
  });

  it('skips a vanished spring-forward interval without returning an inverted window', () => {
    const previousTimezone = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York';
      const skipped = { ...overnight, days: [0], startTime: '02:30', endTime: '03:00' };
      expect(scheduleWindow(skipped, new Date(2026, 2, 8, 12).getTime())).toBeNull();
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });
});
