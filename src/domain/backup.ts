import { deduplicateSessions } from './analytics';
import { reconcileFocus } from './countdown';
import { validateSchedule } from './schedules';
import type { AppInfo, AppLimit, BackupData, FocusSession, PersistentData, Preferences, Schedule, UsageSession } from './types';

export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const MAX_SESSIONS = 100_000;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max = 128): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} must contain 1–${max} characters.`);
  return value;
}

function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`);
  return value;
}

function list(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${label} must be an array with no more than ${max} items.`);
  return value;
}

function unique<T extends { id: string }>(values: T[], label: string): T[] {
  if (new Set(values.map((value) => value.id)).size !== values.length) throw new Error(`${label} contains duplicate IDs.`);
  return values;
}

function appIds(value: unknown, knownApps: Set<string>, label: string): string[] {
  return [...new Set(list(value, label, 200).map((id) => {
    const parsed = text(id, label);
    if (!knownApps.has(parsed)) throw new Error(`${label} references an unknown app.`);
    return parsed;
  }))];
}

export function validatePreferences(value: unknown): Preferences {
  const preferences = object(value, 'Preferences');
  const theme = preferences.theme;
  if (theme !== 'light' && theme !== 'dark' && theme !== 'system') throw new Error('Theme must be light, dark, or system.');
  return {
    dailyGoalMinutes: number(preferences.dailyGoalMinutes, 'Daily goal', 1, 1440),
    weeklyGoalMinutes: number(preferences.weeklyGoalMinutes, 'Weekly goal', 1, 10080),
    defaultFocusMinutes: number(preferences.defaultFocusMinutes, 'Focus duration', 1, 1440),
    theme,
    notifications: boolean(preferences.notifications, 'Notifications'),
  };
}

/** Parses into fresh objects so unsupported fields and prototype properties cannot enter storage. */
export function validatePersistentData(value: unknown): PersistentData {
  const data = object(value, 'Backup data');
  const apps = unique(list(data.apps, 'Apps', 200).map((item): AppInfo => {
    const app = object(item, 'App');
    const color = text(app.color, 'App color', 32);
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('App colors must use six-digit hex values.');
    return { id: text(app.id, 'App ID'), name: text(app.name, 'App name', 100), color, icon: text(app.icon, 'App icon', 60), category: text(app.category, 'App category', 60) };
  }), 'Apps');
  const knownApps = new Set(apps.map((app) => app.id));
  const parseApp = (id: unknown): string => {
    const parsed = text(id, 'App ID');
    if (!knownApps.has(parsed)) throw new Error(`Unknown app reference: ${parsed}.`);
    return parsed;
  };
  const sessions = list(data.sessions, 'Sessions', MAX_SESSIONS).map((item): UsageSession => {
    const session = object(item, 'Session');
    const startedAt = number(session.startedAt, 'Session start', 0, 8.64e15);
    const endedAt = number(session.endedAt, 'Session end', 0, 8.64e15);
    if (endedAt <= startedAt) throw new Error('Every session must end after it starts.');
    return { id: text(session.id, 'Session ID'), appId: parseApp(session.appId), startedAt, endedAt };
  });
  const limits = unique(list(data.limits, 'Limits', 200).map((item): AppLimit => {
    const limit = object(item, 'Limit');
    return { id: text(limit.id, 'Limit ID'), appId: parseApp(limit.appId), minutes: number(limit.minutes, 'Daily limit', 1, 1440), enabled: boolean(limit.enabled, 'Limit enabled') };
  }), 'Limits');
  const schedules = unique(list(data.schedules, 'Schedules', 200).map((item): Schedule => {
    const schedule = object(item, 'Schedule');
    const parsed: Schedule = {
      id: text(schedule.id, 'Schedule ID'), name: text(schedule.name, 'Schedule name', 100),
      startTime: text(schedule.startTime, 'Start time', 5), endTime: text(schedule.endTime, 'End time', 5),
      days: [...new Set(list(schedule.days, 'Schedule days', 7).map((day) => number(day, 'Weekday', 0, 6)))],
      appIds: appIds(schedule.appIds, knownApps, 'Schedule apps'), enabled: boolean(schedule.enabled, 'Schedule enabled'),
    };
    validateSchedule(parsed);
    return parsed;
  }), 'Schedules');
  let focus: FocusSession | null = null;
  if (data.focus !== null) {
    const item = object(data.focus, 'Focus session');
    const status = item.status;
    if (status !== 'active' && status !== 'paused' && status !== 'completed' && status !== 'cancelled') throw new Error('Unknown focus status.');
    const startedAt = number(item.startedAt, 'Focus start', 0, 8.64e15);
    const endsAt = number(item.endsAt, 'Focus end', 0, 8.64e15);
    if (endsAt <= startedAt) throw new Error('Focus end must be after focus start.');
    const durationMinutes = number(item.durationMinutes, 'Focus duration', 1, 1440);
    focus = {
      id: text(item.id, 'Focus ID'), startedAt, endsAt,
      pausedAt: item.pausedAt === null ? null : number(item.pausedAt, 'Paused at', startedAt, 8.64e15),
      remainingOnPause: item.remainingOnPause === null ? null : number(item.remainingOnPause, 'Paused remaining time', 0, durationMinutes * 60_000),
      durationMinutes, appIds: appIds(item.appIds, knownApps, 'Focus apps'), status,
    };
    if (status === 'paused' && (focus.pausedAt === null || focus.remainingOnPause === null)) throw new Error('Paused focus sessions must include their remaining time.');
    if (status !== 'paused' && (focus.pausedAt !== null || focus.remainingOnPause !== null)) throw new Error('Only paused focus sessions can contain pause state.');
  }
  return { apps, sessions: deduplicateSessions(sessions), limits, schedules, focus, preferences: validatePreferences(data.preferences) };
}

export function validateBackup(input: unknown): BackupData {
  let parsed = input;
  if (typeof input === 'string') {
    if (input.length > MAX_BACKUP_BYTES) throw new Error('This backup is too large. The maximum size is 20 MB.');
    try { parsed = JSON.parse(input); } catch { throw new Error('This file is not valid JSON.'); }
  }
  const backup = object(parsed, 'Backup');
  if (backup.format !== 'orbit.local-backup') throw new Error('This is not a supported Orbit backup.');
  if (backup.version !== BACKUP_VERSION) throw new Error(`Backup version ${String(backup.version)} is not supported. This app supports version ${BACKUP_VERSION}.`);
  if (typeof backup.exportedAt !== 'string' || !Number.isFinite(Date.parse(backup.exportedAt))) throw new Error('The backup export date is invalid.');
  return { format: 'orbit.local-backup', version: BACKUP_VERSION, exportedAt: backup.exportedAt, data: validatePersistentData(backup.data) };
}

export function createBackup(data: PersistentData, now = Date.now()): string {
  const backup: BackupData = { format: 'orbit.local-backup', version: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), data: validatePersistentData(data) };
  return JSON.stringify(backup, null, 2);
}

export function previewBackup(input: unknown) {
  const backup = validateBackup(input);
  return { backup, exportedAt: backup.exportedAt, apps: backup.data.apps.length, sessions: backup.data.sessions.length, limits: backup.data.limits.length, schedules: backup.data.schedules.length };
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()];
}

export function restoreBackup(current: PersistentData, input: unknown, mode: 'merge' | 'replace', now = Date.now()): PersistentData {
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Choose merge or replace.');
  const incoming = validateBackup(input).data;
  const restored: PersistentData = mode === 'replace' ? incoming : {
    apps: mergeById(current.apps, incoming.apps),
    sessions: deduplicateSessions([...current.sessions, ...incoming.sessions]),
    limits: mergeById(current.limits, incoming.limits),
    schedules: mergeById(current.schedules, incoming.schedules),
    focus: current.focus,
    preferences: current.preferences,
  };
  return validatePersistentData({ ...restored, focus: reconcileFocus(restored.focus, now) });
}
