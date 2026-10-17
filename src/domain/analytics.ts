import type { UsageSession } from './types';

const MINUTE = 60_000;

export function localDayBounds(timestamp: number): [number, number] {
  const start = new Date(timestamp);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.getTime(), end.getTime()];
}

/** Calendar arithmetic intentionally handles 23/25-hour days and local time zones. */
export function localWeekBounds(timestamp: number): [number, number] {
  const start = new Date(localDayBounds(timestamp)[0]);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return [start.getTime(), end.getTime()];
}

export function localMonthBounds(timestamp: number): [number, number] {
  const date = new Date(timestamp);
  return [new Date(date.getFullYear(), date.getMonth(), 1).getTime(), new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime()];
}

/** Polling can return a longer version of the same native session. Keep that version. */
export function deduplicateSessions(sessions: UsageSession[]): UsageSession[] {
  const ids = new Map<string, UsageSession>();
  for (const session of sessions) {
    if (!session.id || !session.appId || !Number.isFinite(session.startedAt) || !Number.isFinite(session.endedAt) || session.endedAt <= session.startedAt) continue;
    const previous = ids.get(session.id);
    if (!previous || session.endedAt > previous.endedAt) ids.set(session.id, { ...session });
  }
  const signatures = new Set<string>();
  return [...ids.values()].sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id)).filter((session) => {
    const signature = `${session.appId}:${session.startedAt}:${session.endedAt}`;
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    return true;
  });
}

/**
 * Reconcile overlapping foreground intervals in O(n log n). The most recently
 * started app owns an overlap; ties have a stable ID order. This keeps app totals
 * additive without counting simultaneous app observations twice.
 */
export function normalizeSessions(input: UsageSession[]): UsageSession[] {
  const sessions = deduplicateSessions(input);
  const events = sessions.flatMap((session, index) => [
    { time: session.startedAt, index, start: true },
    { time: session.endedAt, index, start: false },
  ]).sort((a, b) => a.time - b.time);
  const active = new Set<number>();
  const heap: number[] = [];
  const isHigher = (a: number, b: number) => sessions[a]!.startedAt > sessions[b]!.startedAt || (sessions[a]!.startedAt === sessions[b]!.startedAt && sessions[a]!.id < sessions[b]!.id);
  const push = (index: number) => {
    heap.push(index);
    let child = heap.length - 1;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (!isHigher(heap[child]!, heap[parent]!)) break;
      [heap[child], heap[parent]] = [heap[parent]!, heap[child]!];
      child = parent;
    }
  };
  const pop = () => {
    const last = heap.pop();
    if (heap.length === 0 || last === undefined) return;
    heap[0] = last;
    let parent = 0;
    while (true) {
      let child = parent * 2 + 1;
      if (child >= heap.length) break;
      if (child + 1 < heap.length && isHigher(heap[child + 1]!, heap[child]!)) child += 1;
      if (!isHigher(heap[child]!, heap[parent]!)) break;
      [heap[parent], heap[child]] = [heap[child]!, heap[parent]!];
      parent = child;
    }
  };
  const output: UsageSession[] = [];
  let previousTime = events[0]?.time ?? 0;
  let cursor = 0;
  while (cursor < events.length) {
    const time = events[cursor]!.time;
    while (heap.length && !active.has(heap[0]!)) pop();
    if (heap.length && time > previousTime) {
      const owner = sessions[heap[0]!]!;
      const previous = output[output.length - 1];
      if (previous?.id === owner.id && previous.endedAt === previousTime) previous.endedAt = time;
      else output.push({ ...owner, startedAt: previousTime, endedAt: time });
    }
    while (cursor < events.length && events[cursor]!.time === time) {
      const event = events[cursor++]!;
      if (event.start) { active.add(event.index); push(event.index); }
      else active.delete(event.index);
    }
    previousTime = time;
  }
  return output;
}

export interface RangeSummary {
  totalMinutes: number;
  sessionCount: number;
  appMinutes: Record<string, number>;
  averageSessionMinutes: number;
}

function aggregateNormalized(sessions: UsageSession[], start: number, end: number): RangeSummary {
  const appMilliseconds: Record<string, number> = Object.create(null) as Record<string, number>;
  const ids = new Set<string>();
  let totalMilliseconds = 0;
  for (const session of sessions) {
    const milliseconds = Math.min(session.endedAt, end) - Math.max(session.startedAt, start);
    if (milliseconds <= 0) continue;
    ids.add(session.id);
    totalMilliseconds += milliseconds;
    appMilliseconds[session.appId] = (appMilliseconds[session.appId] ?? 0) + milliseconds;
  }
  return {
    totalMinutes: totalMilliseconds / MINUTE,
    sessionCount: ids.size,
    appMinutes: Object.fromEntries(Object.entries(appMilliseconds).map(([id, value]) => [id, value / MINUTE])),
    averageSessionMinutes: ids.size ? totalMilliseconds / MINUTE / ids.size : 0,
  };
}

export function aggregateRange(sessions: UsageSession[], start: number, end: number): RangeSummary {
  return aggregateNormalized(normalizeSessions(sessions), start, end);
}

export interface DayUsage { date: number; label: string; minutes: number }

export function calculateSummary(sessions: UsageSession[], dayTimestamp = Date.now(), goalMinutes = 180) {
  const normalized = normalizeSessions(sessions);
  const [start, end] = localDayBounds(dayTimestamp);
  const previousDate = new Date(start);
  previousDate.setDate(previousDate.getDate() - 1);
  const [weekStart] = localWeekBounds(dayTimestamp);
  const weekDays: DayUsage[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    const [dayStart, dayEnd] = localDayBounds(date.getTime());
    return { date: dayStart, label: date.toLocaleDateString('en-US', { weekday: 'short' }), minutes: aggregateNormalized(normalized, dayStart, dayEnd).totalMinutes };
  });
  return {
    ...aggregateNormalized(normalized, start, end),
    previousDayMinutes: aggregateNormalized(normalized, previousDate.getTime(), start).totalMinutes,
    weekDays,
    dailyGoalMinutes: goalMinutes,
  };
}

export function monthDays(sessions: UsageSession[], timestamp = Date.now()): DayUsage[] {
  const normalized = normalizeSessions(sessions);
  const [start, end] = localMonthBounds(timestamp);
  const result: DayUsage[] = [];
  for (const day = new Date(start); day.getTime() < end; day.setDate(day.getDate() + 1)) {
    const [dayStart, dayEnd] = localDayBounds(day.getTime());
    result.push({ date: dayStart, label: String(day.getDate()), minutes: aggregateNormalized(normalized, dayStart, dayEnd).totalMinutes });
  }
  return result;
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  if (total < 60) return `${total}m`;
  const remainder = total % 60;
  return `${Math.floor(total / 60)}h${remainder ? ` ${remainder}m` : ''}`;
}
