import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyData } from '../src/domain/defaults';

const native = vi.hoisted(() => ({ db: null as DatabaseSync | null, failSQL: '' }));

vi.mock('expo-sqlite', async () => {
  const { DatabaseSync: SQLite } = await import('node:sqlite');
  return {
    openDatabaseAsync: async () => {
      native.db ??= new SQLite(':memory:');
      const db = native.db;
      const adapter = {
        execAsync: async (sql: string) => { db.exec(sql); },
        runAsync: async (sql: string, ...args: SQLInputValue[]) => {
          if (native.failSQL && sql.includes(native.failSQL)) throw new Error('Simulated write failure');
          return db.prepare(sql).run(...args);
        },
        getFirstAsync: async (sql: string) => db.prepare(sql).get(),
        getAllAsync: async (sql: string) => db.prepare(sql).all(),
        withExclusiveTransactionAsync: async (callback: (transaction: unknown) => Promise<void>) => {
          db.exec('BEGIN IMMEDIATE');
          try { await callback(adapter); db.exec('COMMIT'); }
          catch (error) { db.exec('ROLLBACK'); throw error; }
        },
      };
      return adapter;
    },
  };
});

beforeEach(() => {
  native.db?.close();
  native.db = null;
  native.failSQL = '';
  vi.resetModules();
});

describe('SQLite migrations and atomic restoration', () => {
  it('migrates an empty database and persists normalized records', async () => {
    const { database } = await import('../src/data/database.native');
    expect((await database.load()).data.sessions).toEqual([]);
    expect(native.db?.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 1 });
    const data = emptyData();
    data.sessions = [{ id: 'real', appId: 'youtube', startedAt: 1000, endedAt: 61_000 }];
    await database.save(data);
    await database.setSampleMode(false);
    expect(await database.load()).toEqual({ data, sampleMode: false });
    const indexes = native.db?.prepare("SELECT name FROM sqlite_master WHERE type='index'").all();
    expect(indexes).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'sessions_app_time' })]));
  });

  it('rolls back a failed replace write and leaves previous records usable', async () => {
    const { database } = await import('../src/data/database.native');
    await database.load();
    const original = emptyData();
    original.sessions = [{ id: 'original', appId: 'youtube', startedAt: 1000, endedAt: 61_000 }];
    await database.save(original);
    const replacement = emptyData();
    replacement.sessions = [{ id: 'replacement', appId: 'instagram', startedAt: 1000, endedAt: 121_000 }];
    native.failSQL = 'INSERT INTO usage_sessions';
    await expect(database.save(replacement)).rejects.toThrow('Simulated write failure');
    native.failSQL = '';
    expect((await database.load()).data).toEqual(original);
    await database.save(replacement);
    expect((await database.load()).data).toEqual(replacement);
  });

  it('validates before any transaction can change persisted data', async () => {
    const { database } = await import('../src/data/database.native');
    await database.load();
    const original = emptyData();
    await database.save(original);
    await expect(database.save({ ...original, preferences: { ...original.preferences, dailyGoalMinutes: -20 } })).rejects.toThrow();
    expect((await database.load()).data).toEqual(original);
  });

  it('refuses newer database schemas without running destructive migrations', async () => {
    const { DatabaseSync: SQLite } = await import('node:sqlite');
    native.db = new SQLite(':memory:');
    native.db.exec('PRAGMA user_version = 99');
    const { database } = await import('../src/data/database.native');
    await expect(database.load()).rejects.toThrow('newer app version');
    expect(native.db.prepare('PRAGMA user_version').get()).toMatchObject({ user_version: 99 });
  });
});
