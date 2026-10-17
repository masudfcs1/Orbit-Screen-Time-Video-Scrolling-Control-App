import { localDayBounds } from './analytics';
import { remainingFocusMilliseconds } from './countdown';
import type { AppLimit, FocusSession, Schedule } from './types';

export function parseClock(value: string): { hours: number; minutes: number } {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Use a valid time in HH:mm format.');
  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(3, 5));
  return { hours, minutes };
}

export function validateSchedule(schedule: Omit<Schedule, 'id'>): void {
  parseClock(schedule.startTime);
  parseClock(schedule.endTime);
  if (schedule.startTime === schedule.endTime) throw new Error('Start and end times must be different.');
  if (!schedule.name.trim() || schedule.name.length > 100) throw new Error('Give this schedule a name of 1–100 characters.');
  if (!schedule.days.length || schedule.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Choose at least one valid weekday.');
  if (!schedule.appIds.length) throw new Error('Choose at least one app for this schedule.');
}

/** A schedule belongs to its starting weekday, including overnight periods. */
export function scheduleWindow(schedule: Schedule, dayTimestamp: number): [number, number] | null {
  const day = new Date(localDayBounds(dayTimestamp)[0]);
  if (!schedule.enabled || !schedule.days.includes(day.getDay())) return null;
  const from = parseClock(schedule.startTime);
  const to = parseClock(schedule.endTime);
  const start = new Date(day);
  const end = new Date(day);
  start.setHours(from.hours, from.minutes, 0, 0);
  if (schedule.endTime <= schedule.startTime) end.setDate(end.getDate() + 1);
  end.setHours(to.hours, to.minutes, 0, 0);
  // A spring-forward gap can move a nonexistent start beyond its intended end.
  // That skipped occurrence must not surface as an inverted active window.
  if (end.getTime() <= start.getTime()) return null;
  return [start.getTime(), end.getTime()];
}

export function isScheduleActive(schedule: Schedule, now = Date.now()): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return [now, yesterday.getTime()].some((day) => {
    const window = scheduleWindow(schedule, day);
    return window !== null && now >= window[0] && now < window[1];
  });
}

export function nextScheduleStart(schedule: Schedule, now = Date.now()): number | null {
  if (!schedule.enabled) return null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const window = scheduleWindow(schedule, day.getTime());
    if (window && window[0] > now) return window[0];
  }
  return null;
}

export function schedulesOverlap(first: Schedule, second: Schedule): boolean {
  if (!first.enabled || !second.enabled || !first.appIds.some((app) => second.appIds.includes(app))) return false;
  // Stable Monday seed; include an extra week so Sunday overnight overlaps Monday.
  const monday = new Date(2024, 0, 1);
  const firstWindows: [number, number][] = [];
  const secondWindows: [number, number][] = [];
  for (let day = -1; day <= 7; day += 1) {
    const date = new Date(monday);
    date.setDate(date.getDate() + day);
    const a = scheduleWindow(first, date.getTime());
    const b = scheduleWindow(second, date.getTime());
    if (a) firstWindows.push(a);
    if (b) secondWindows.push(b);
  }
  return firstWindows.some(([a, b]) => secondWindows.some(([c, d]) => a < d && c < b));
}

/** All active restrictions combine as a union; removing one never bypasses another. */
export function restrictionReasons(appId: string, limits: AppLimit[], schedules: Schedule[], focus: FocusSession | null, usedMinutes: number, now = Date.now()): string[] {
  const reasons: string[] = [];
  if (limits.some((limit) => limit.enabled && limit.appId === appId && usedMinutes >= limit.minutes)) reasons.push('Daily allowance reached');
  for (const schedule of schedules) if (schedule.appIds.includes(appId) && isScheduleActive(schedule, now)) reasons.push(schedule.name);
  if (focus?.status === 'active' && focus.appIds.includes(appId) && remainingFocusMilliseconds(focus, now) > 0) reasons.push('Focus session');
  return reasons;
}
