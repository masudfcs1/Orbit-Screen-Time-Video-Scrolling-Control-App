import * as SQLite from 'expo-sqlite';
import { validatePersistentData } from '../domain/backup';
import { emptyData } from '../domain/defaults';
import type { AppInfo, AppLimit, PersistentData, Schedule, UsageSession } from '../domain/types';
import { MIGRATIONS } from './migrations';
import { DATA_SCHEMA_VERSION, DEVELOPMENT_PREVIEW_AVAILABLE, type LocalDatabase } from './repository';

let connection: Promise<SQLite.SQLiteDatabase> | null = null;
let previousSnapshot: PersistentData | null = null;

function connect(): Promise<SQLite.SQLiteDatabase> {
  if (!connection) {
    connection = (async () => {
      const db = await SQLite.openDatabaseAsync('orbit.db');
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      const version = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;'))?.user_version ?? 0;
      if (version > DATA_SCHEMA_VERSION) throw new Error('This database was created by a newer app version. Please update the app.');
      for (let index = version; index < MIGRATIONS.length; index += 1) {
        await db.withExclusiveTransactionAsync(async (transaction) => {
          await transaction.execAsync(MIGRATIONS[index]!);
          await transaction.execAsync(`PRAGMA user_version = ${index + 1};`);
        });
      }
      return db;
    })().catch((error) => { connection = null; throw error; });
  }
  return connection;
}

function changes<T extends { id: string }>(previous: T[] | undefined, next: T[]) {
  const before = new Map((previous ?? []).map((item) => [item.id, item]));
  const nextIds = new Set(next.map((item) => item.id));
  return { removed: [...before.keys()].filter((id) => !nextIds.has(id)), changed: next.filter((item) => JSON.stringify(before.get(item.id)) !== JSON.stringify(item)) };
}

export const database: LocalDatabase = {
  async load() {
    const db = await connect();
    const [apps, sessions, limits, schedules, metadata] = await Promise.all([
      db.getAllAsync<AppInfo>('SELECT id, name, color, icon, category FROM apps'),
      db.getAllAsync<UsageSession>('SELECT id, app_id AS appId, started_at AS startedAt, ended_at AS endedAt FROM usage_sessions ORDER BY started_at'),
      db.getAllAsync<Omit<AppLimit, 'enabled'> & { enabled: number }>('SELECT id, app_id AS appId, minutes, enabled FROM app_limits'),
      db.getAllAsync<{ id: string; name: string; start_time: string; end_time: string; days_json: string; app_ids_json: string; enabled: number }>('SELECT * FROM schedules'),
      db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM app_metadata'),
    ]);
    const meta = Object.fromEntries(metadata.map((item) => [item.key, item.value]));
    const defaults = emptyData();
    const data = validatePersistentData({
      apps: apps.length ? apps : defaults.apps,
      sessions,
      limits: limits.map((limit) => ({ ...limit, enabled: limit.enabled === 1 })),
      schedules: schedules.map((schedule): Schedule => ({ id: schedule.id, name: schedule.name, startTime: schedule.start_time, endTime: schedule.end_time, days: JSON.parse(schedule.days_json), appIds: JSON.parse(schedule.app_ids_json), enabled: schedule.enabled === 1 })),
      focus: meta.focus ? JSON.parse(meta.focus) : null,
      preferences: meta.preferences ? JSON.parse(meta.preferences) : defaults.preferences,
    });
    // Empty installations have no app rows yet; the first write must insert them.
    previousSnapshot = apps.length ? data : null;
    return { data, sampleMode: DEVELOPMENT_PREVIEW_AVAILABLE && meta.sampleMode !== 'false' };
  },
  async save(input) {
    const data = validatePersistentData(input);
    const db = await connect();
    const appChanges = changes(previousSnapshot?.apps, data.apps);
    const sessionChanges = changes(previousSnapshot?.sessions, data.sessions);
    const limitChanges = changes(previousSnapshot?.limits, data.limits);
    const scheduleChanges = changes(previousSnapshot?.schedules, data.schedules);
    await db.withExclusiveTransactionAsync(async (transaction) => {
      if (!previousSnapshot) {
        await transaction.execAsync('DELETE FROM usage_sessions; DELETE FROM app_limits; DELETE FROM schedules; DELETE FROM apps;');
      }
      // Delete dependent rows first so replace imports honor foreign keys.
      for (const id of sessionChanges.removed) await transaction.runAsync('DELETE FROM usage_sessions WHERE id = ?', id);
      for (const id of limitChanges.removed) await transaction.runAsync('DELETE FROM app_limits WHERE id = ?', id);
      for (const id of scheduleChanges.removed) await transaction.runAsync('DELETE FROM schedules WHERE id = ?', id);
      for (const app of appChanges.changed) await transaction.runAsync('INSERT INTO apps(id, name, color, icon, category) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,icon=excluded.icon,category=excluded.category', app.id, app.name, app.color, app.icon, app.category);
      for (const session of sessionChanges.changed) await transaction.runAsync('INSERT INTO usage_sessions(id, app_id, started_at, ended_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET app_id=excluded.app_id,started_at=excluded.started_at,ended_at=excluded.ended_at', session.id, session.appId, session.startedAt, session.endedAt);
      for (const limit of limitChanges.changed) await transaction.runAsync('INSERT INTO app_limits(id, app_id, minutes, enabled) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET app_id=excluded.app_id,minutes=excluded.minutes,enabled=excluded.enabled', limit.id, limit.appId, limit.minutes, limit.enabled ? 1 : 0);
      for (const schedule of scheduleChanges.changed) await transaction.runAsync('INSERT INTO schedules(id, name, start_time, end_time, days_json, app_ids_json, enabled) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,start_time=excluded.start_time,end_time=excluded.end_time,days_json=excluded.days_json,app_ids_json=excluded.app_ids_json,enabled=excluded.enabled', schedule.id, schedule.name, schedule.startTime, schedule.endTime, JSON.stringify(schedule.days), JSON.stringify(schedule.appIds), schedule.enabled ? 1 : 0);
      for (const id of appChanges.removed) await transaction.runAsync('DELETE FROM apps WHERE id = ?', id);
      await transaction.runAsync('INSERT INTO app_metadata(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'preferences', JSON.stringify(data.preferences));
      await transaction.runAsync('INSERT INTO app_metadata(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'focus', JSON.stringify(data.focus));
    });
    // Never advance the cache on a failed transaction.
    previousSnapshot = data;
  },
  async setSampleMode(enabled) {
    if (enabled && !DEVELOPMENT_PREVIEW_AVAILABLE) throw new Error('Demo data is available only in development builds.');
    const db = await connect();
    await db.runAsync('INSERT INTO app_metadata(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'sampleMode', String(enabled));
  },
};
