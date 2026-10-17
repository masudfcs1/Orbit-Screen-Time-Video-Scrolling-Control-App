import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBackup } from '../src/domain/backup';
import { emptyData } from '../src/domain/defaults';

class TestStorage implements Storage {
  values = new Map<string, string>();
  failWrites = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('Simulated storage failure');
    this.values.set(key, String(value));
  }
}

let storage: TestStorage;
beforeEach(() => { storage = new TestStorage(); vi.stubGlobal('window', { localStorage: storage }); vi.stubGlobal('__DEV__', true); vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('real data and demo isolation', () => {
  it('starts production with real empty data and prevents enabling a preview', async () => {
    vi.stubGlobal('__DEV__', false);
    storage.setItem('orbit.preview-mode', 'true');
    const { useAppStore } = await import('../src/store/useAppStore');
    await useAppStore.getState().hydrate();
    expect(useAppStore.getState()).toMatchObject({ sampleMode: false, sessions: [], limits: [], schedules: [] });
    await expect(useAppStore.getState().setSampleMode(true)).rejects.toThrow('development builds');
    expect(useAppStore.getState().sampleMode).toBe(false);
  });

  it('shows an explicit demo initially but exports only an empty real dataset', async () => {
    const { useAppStore } = await import('../src/store/useAppStore');
    await useAppStore.getState().hydrate();
    expect(useAppStore.getState().sampleMode).toBe(true);
    expect(useAppStore.getState().sessions.length).toBeGreaterThan(0);
    expect(JSON.parse(useAppStore.getState().exportBackup()).data.sessions).toEqual([]);
    await useAppStore.getState().addLimit({ appId: 'youtube', minutes: 15 });
    expect(JSON.parse(useAppStore.getState().exportBackup()).data.limits).toEqual([]);
    await useAppStore.getState().setSampleMode(false);
    expect(useAppStore.getState().sessions).toEqual([]);
    expect(useAppStore.getState().limits).toEqual([]);
  });

  it('keeps native records real even while demo is displayed', async () => {
    const { useAppStore } = await import('../src/store/useAppStore');
    await useAppStore.getState().hydrate();
    const sessions = [{ id: 'native-event', appId: 'youtube', startedAt: 1000, endedAt: 61_000 }];
    await useAppStore.getState().recordSessions(sessions);
    expect(useAppStore.getState().sessions.some((session) => session.id === 'native-event')).toBe(false);
    expect(JSON.parse(useAppStore.getState().exportBackup()).data.sessions).toEqual(sessions);
    await useAppStore.getState().setSampleMode(false);
    expect(useAppStore.getState().sessions).toEqual(sessions);
  });

  it('serializes concurrent writes and persists global preferences in demo mode', async () => {
    const { useAppStore } = await import('../src/store/useAppStore');
    await useAppStore.getState().hydrate();
    await useAppStore.getState().setPreferences({ dailyGoalMinutes: 90, theme: 'dark' });
    await useAppStore.getState().setSampleMode(false);
    await Promise.all([useAppStore.getState().addLimit({ appId: 'youtube', minutes: 45 }), useAppStore.getState().addLimit({ appId: 'instagram', minutes: 30 })]);
    expect(useAppStore.getState().limits).toHaveLength(2);
    expect(useAppStore.getState().preferences.dailyGoalMinutes).toBe(90);
    vi.resetModules();
    const { useAppStore: reopened } = await import('../src/store/useAppStore');
    await reopened.getState().hydrate();
    expect(reopened.getState()).toMatchObject({ sampleMode: false, preferences: { theme: 'dark', dailyGoalMinutes: 90 } });
    expect(reopened.getState().limits).toHaveLength(2);
  });

  it('leaves UI and storage unchanged after a failed import commit', async () => {
    const { useAppStore } = await import('../src/store/useAppStore');
    await useAppStore.getState().hydrate();
    await useAppStore.getState().setSampleMode(false);
    await useAppStore.getState().addLimit({ appId: 'youtube', minutes: 45 });
    const before = useAppStore.getState().exportBackup();
    storage.failWrites = true;
    await expect(useAppStore.getState().importBackup(createBackup(emptyData()), 'replace')).rejects.toThrow();
    expect(useAppStore.getState().limits).toHaveLength(1);
    expect(JSON.parse(useAppStore.getState().exportBackup()).data).toEqual(JSON.parse(before).data);
    expect(useAppStore.getState().error).toContain('storage failure');
  });

  it('persists notification pause, resume, and confirmed stop actions for the matching focus', async () => {
    const { useAppStore } = await import('../src/store/useAppStore');
    await useAppStore.getState().hydrate();
    await useAppStore.getState().setSampleMode(false);
    await useAppStore.getState().startFocus(10, ['youtube']);
    const focus = useAppStore.getState().focus!;
    await useAppStore.getState().reconcileNativeCountdown({ id: 'stale-notification', endsAt: focus.endsAt, status: 'paused', remainingMs: 30_000 });
    expect(useAppStore.getState().focus?.status).toBe('active');
    await useAppStore.getState().reconcileNativeCountdown({ id: focus.id, endsAt: focus.endsAt, status: 'paused', remainingMs: 9 * 60_000 });
    expect(useAppStore.getState().focus).toMatchObject({ status: 'paused', remainingOnPause: 9 * 60_000 });
    const nextDeadline = Date.now() + 9 * 60_000;
    await useAppStore.getState().reconcileNativeCountdown({ id: focus.id, endsAt: nextDeadline, status: 'running', remainingMs: 9 * 60_000 });
    expect(useAppStore.getState().focus).toMatchObject({ status: 'active', endsAt: nextDeadline, pausedAt: null, remainingOnPause: null });
    await useAppStore.getState().reconcileNativeCountdown(null);
    expect(JSON.parse(useAppStore.getState().exportBackup()).data.focus.status).toBe('cancelled');
  });
});
