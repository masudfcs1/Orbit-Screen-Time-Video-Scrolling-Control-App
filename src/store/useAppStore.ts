import { create } from 'zustand';
import { database } from '../data/database';
import { createSampleData } from '../data/sample';
import { DEVELOPMENT_PREVIEW_AVAILABLE } from '../data/repository';
import { deduplicateSessions } from '../domain/analytics';
import { createBackup, restoreBackup, validatePersistentData, validatePreferences } from '../domain/backup';
import { cancelFocus, createFocus, pauseFocus as pause, reconcileFocus, resumeFocus as resume } from '../domain/countdown';
import { emptyData } from '../domain/defaults';
import { validateSchedule } from '../domain/schedules';
import type { AppLimit, AppState, NativeCountdownSnapshot, PersistentData, Preferences, Schedule, UsageSession } from '../domain/types';

export interface AppActions {
  error: string | null;
  clearError(): void;
  hydrate(): Promise<void>;
  setSampleMode(enabled: boolean): Promise<void>;
  setPreferences(preferences: Partial<Preferences>): Promise<void>;
  addLimit(input: { appId: string; minutes: number }): Promise<void>;
  updateLimit(id: string, updates: Partial<Omit<AppLimit, 'id'>>): Promise<void>;
  removeLimit(id: string): Promise<void>;
  addSchedule(input: Omit<Schedule, 'id'>): Promise<void>;
  updateSchedule(id: string, updates: Partial<Omit<Schedule, 'id'>>): Promise<void>;
  removeSchedule(id: string): Promise<void>;
  startFocus(minutes: number, appIds: string[]): Promise<void>;
  pauseFocus(): Promise<void>;
  resumeFocus(): Promise<void>;
  stopFocus(): Promise<void>;
  tickFocus(): Promise<void>;
  /** Pass null only after confirming a previously started native countdown stopped. */
  reconcileNativeCountdown(native: NativeCountdownSnapshot | null): Promise<void>;
  importBackup(backup: unknown, mode: 'merge' | 'replace'): Promise<void>;
  exportBackup(): string;
  resetData(): Promise<void>;
  recordSessions(sessions: UsageSession[]): Promise<void>;
}

let realData = emptyData();
let sampleData: PersistentData | null = null;
let ready = false;
let hydration: Promise<void> | null = null;
let operations: Promise<unknown> = Promise.resolve();
let sequence = 0;

function uniqueId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'QuotaExceededError') return 'Your device storage is full. Free some space, then try again.';
    if (error.name === 'SecurityError') return 'Local storage is unavailable in this browser. Allow local storage or use the native app.';
    return error.message;
  }
  return 'The local data could not be saved. Please try again.';
}

/** Serial writes prevent rapid taps or native polls from overwriting one another. */
function enqueue(operation: () => Promise<void>): Promise<void> {
  const result = operations.then(operation);
  operations = result.catch(() => undefined);
  return result.catch((error: unknown) => {
    useAppStore.setState({ error: errorMessage(error) });
    throw error;
  });
}

function requireReady(): void {
  if (!ready) throw new Error('Local storage is not ready. Please retry loading the app.');
}

function checkApps(appIds: string[], data: PersistentData): void {
  const known = new Set(data.apps.map((app) => app.id));
  if (appIds.some((id) => !known.has(id))) throw new Error('One of the selected apps is no longer available.');
}

function checkMinutes(minutes: number): void {
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) throw new Error('Choose a duration from 1 to 1,440 minutes.');
}

async function saveVisible(transform: (data: PersistentData) => PersistentData): Promise<void> {
  requireReady();
  const isSample = useAppStore.getState().sampleMode;
  const current = isSample ? sampleData ?? createSampleData() : realData;
  const transformed = transform(current);
  if (transformed === current) return;
  const next = validatePersistentData(transformed);
  if (isSample) sampleData = next;
  else { await database.save(next); realData = next; }
  useAppStore.setState({ ...next, error: null });
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  ...emptyData(),
  sampleMode: DEVELOPMENT_PREVIEW_AVAILABLE,
  hydrated: false,
  error: null,
  clearError: () => set({ error: null }),
  hydrate: () => {
    if (ready) return Promise.resolve();
    if (hydration) return hydration;
    hydration = enqueue(async () => {
      try {
        const stored = await database.load();
        const focus = reconcileFocus(stored.data.focus);
        realData = { ...stored.data, focus };
        if (focus !== stored.data.focus) await database.save(realData);
        ready = true;
        if (stored.sampleMode) sampleData = { ...createSampleData(), preferences: { ...realData.preferences } };
        set({ ...(stored.sampleMode ? sampleData! : realData), sampleMode: stored.sampleMode, hydrated: true, error: null });
      } catch (error) {
        set({ hydrated: true });
        throw error;
      }
    }).finally(() => { hydration = null; });
    return hydration;
  },
  setSampleMode: (enabled) => enqueue(async () => {
    requireReady();
    if (enabled && !DEVELOPMENT_PREVIEW_AVAILABLE) throw new Error('Demo data is available only in development builds.');
    if (enabled && !sampleData) sampleData = { ...createSampleData(), preferences: { ...realData.preferences } };
    const selected = enabled ? sampleData! : realData;
    const focus = reconcileFocus(selected.focus);
    if (!enabled && focus !== selected.focus) {
      const next = { ...realData, focus };
      await database.save(next);
      realData = next;
    }
    if (enabled) sampleData = { ...selected, focus };
    await database.setSampleMode(enabled);
    set({ ...(enabled ? sampleData! : realData), sampleMode: enabled, error: null });
  }),
  setPreferences: (updates) => enqueue(async () => {
    requireReady();
    const preferences = validatePreferences({ ...realData.preferences, ...updates });
    const next = { ...realData, preferences };
    await database.save(next);
    realData = next;
    if (sampleData) sampleData = { ...sampleData, preferences: { ...preferences } };
    set({ preferences, error: null });
  }),
  addLimit: (input) => enqueue(() => saveVisible((data) => {
    checkApps([input.appId], data);
    checkMinutes(input.minutes);
    const existing = data.limits.find((limit) => limit.appId === input.appId);
    const limits = existing
      ? data.limits.map((limit) => limit.id === existing.id ? { ...limit, minutes: input.minutes, enabled: true } : limit)
      : [...data.limits, { id: uniqueId('limit'), ...input, enabled: true }];
    return { ...data, limits };
  })),
  updateLimit: (id, updates) => enqueue(() => saveVisible((data) => {
    if (!data.limits.some((limit) => limit.id === id)) throw new Error('This limit could not be found.');
    if (updates.appId !== undefined) checkApps([updates.appId], data);
    if (updates.minutes !== undefined) checkMinutes(updates.minutes);
    return { ...data, limits: data.limits.map((limit) => limit.id === id ? { ...limit, ...updates } : limit) };
  })),
  removeLimit: (id) => enqueue(() => saveVisible((data) => ({ ...data, limits: data.limits.filter((limit) => limit.id !== id) }))),
  addSchedule: (input) => enqueue(() => saveVisible((data) => {
    validateSchedule(input);
    checkApps(input.appIds, data);
    return { ...data, schedules: [...data.schedules, { ...input, id: uniqueId('schedule'), days: [...new Set(input.days)], appIds: [...new Set(input.appIds)] }] };
  })),
  updateSchedule: (id, updates) => enqueue(() => saveVisible((data) => {
    const current = data.schedules.find((schedule) => schedule.id === id);
    if (!current) throw new Error('This schedule could not be found.');
    const next = { ...current, ...updates };
    validateSchedule(next);
    checkApps(next.appIds, data);
    return { ...data, schedules: data.schedules.map((schedule) => schedule.id === id ? next : schedule) };
  })),
  removeSchedule: (id) => enqueue(() => saveVisible((data) => ({ ...data, schedules: data.schedules.filter((schedule) => schedule.id !== id) }))),
  startFocus: (minutes, appIds) => enqueue(() => saveVisible((data) => {
    checkApps(appIds, data);
    return { ...data, focus: createFocus(minutes, appIds, Date.now(), uniqueId('focus')) };
  })),
  pauseFocus: () => enqueue(() => saveVisible((data) => ({ ...data, focus: pause(data.focus) }))),
  resumeFocus: () => enqueue(() => saveVisible((data) => ({ ...data, focus: resume(data.focus) }))),
  stopFocus: () => enqueue(() => saveVisible((data) => ({ ...data, focus: cancelFocus(data.focus) }))),
  tickFocus: () => {
    // Remaining time is derived from endsAt in the UI, so ticks never write unless expired.
    if (get().focus?.status !== 'active' || get().focus!.endsAt > Date.now()) return Promise.resolve();
    return enqueue(() => saveVisible((data) => {
      const focus = reconcileFocus(data.focus);
      return focus === data.focus ? data : { ...data, focus };
    }));
  },
  reconcileNativeCountdown: (native) => enqueue(async () => {
    requireReady();
    const current = realData.focus;
    if (!current || current.status === 'completed' || current.status === 'cancelled') return;
    if (native && native.id !== current.id) return;
    let focus = cancelFocus(current);
    if (native) {
      if (native.status !== 'paused' && native.status !== 'running') throw new Error('The native countdown returned an invalid status.');
      if (!Number.isFinite(native.endsAt) || native.endsAt <= current.startedAt || !Number.isFinite(native.remainingMs) || native.remainingMs < 0 || native.remainingMs > current.durationMinutes * 60_000) throw new Error('The native countdown returned invalid timing information.');
      focus = native.status === 'paused' && native.remainingMs > 0
        ? { ...current, status: 'paused', endsAt: native.endsAt, pausedAt: Math.max(current.startedAt, Date.now()), remainingOnPause: native.remainingMs }
        : reconcileFocus({ ...current, status: native.status === 'paused' ? 'completed' : 'active', endsAt: native.endsAt, pausedAt: null, remainingOnPause: null });
    }
    const next = validatePersistentData({ ...realData, focus });
    await database.save(next);
    realData = next;
    if (!get().sampleMode) set({ focus: next.focus, error: null });
  }),
  importBackup: (input, mode) => enqueue(async () => {
    if (mode === 'merge') requireReady();
    const next = restoreBackup(realData, input, mode);
    // Import always targets real data, including when the preview is visible.
    await database.save(next);
    realData = next;
    ready = true;
    if (sampleData) sampleData = { ...sampleData, preferences: { ...next.preferences } };
    set({ ...(get().sampleMode ? sampleData ?? createSampleData() : realData), hydrated: true, error: null });
  }),
  exportBackup: () => {
    requireReady();
    return createBackup(realData);
  },
  resetData: () => enqueue(async () => {
    const next = emptyData();
    await database.save(next);
    realData = next;
    ready = true;
    if (get().sampleMode) sampleData = createSampleData();
    set({ ...(get().sampleMode ? sampleData! : realData), hydrated: true, error: null });
  }),
  recordSessions: (incoming) => enqueue(async () => {
    requireReady();
    checkApps(incoming.map((session) => session.appId), realData);
    // Validate individual records before deduplication can discard malformed input.
    validatePersistentData({ ...realData, sessions: incoming });
    const sessions = deduplicateSessions([...realData.sessions, ...incoming]);
    const next = { ...realData, sessions };
    await database.save(next);
    realData = next;
    if (!get().sampleMode) set({ sessions, error: null });
  }),
}));
