import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAppStore, type AppActions } from '../store/useAppStore';
import type { AppState as LocalAppState, FocusSession } from '../domain/types';
import * as device from '../services/device';

export type RestrictionSyncStatus = 'pending' | 'synced' | 'preview' | 'unavailable' | 'failed';
export interface DeviceSyncState {
  capabilities: device.DeviceCapabilities | null;
  syncing: boolean;
  error: string | null;
  restrictionStatus: RestrictionSyncStatus;
  restrictionsSynced: boolean;
  lastSyncedAt: number | null;
}
interface DeviceContextValue extends DeviceSyncState { refresh(): Promise<void> }
const initialSyncState: DeviceSyncState = {
  capabilities: null, syncing: false, error: null,
  restrictionStatus: 'pending', restrictionsSynced: false, lastSyncedAt: null,
};
const DeviceContext = createContext<DeviceContextValue>({ ...initialSyncState, refresh: async () => {} });
export const useDevice = () => useContext(DeviceContext);

type SyncStore = Pick<LocalAppState & AppActions,
  'hydrated' | 'sampleMode' | 'limits' | 'schedules' | 'focus' | 'preferences' |
  'recordSessions' | 'reconcileNativeCountdown' | 'tickFocus'>;
type SyncBridge = Pick<device.DeviceBridge,
  'getCapabilities' | 'readUsageSessions' | 'getNativeCountdownState' |
  'syncRestrictions' | 'startNativeCountdown' | 'stopNativeCountdown'> & {
    getNativeCountdownAction?(): Promise<{ id: string; action: 'stopped' | 'expired'; at: number } | null>;
    acknowledgeNativeCountdownAction?(at: number): Promise<void>;
  };

function focusKey(focus: FocusSession | null): string {
  return focus ? `${focus.id}:${focus.status}:${focus.endsAt}:${focus.remainingOnPause}` : 'none';
}
function planKey(store: SyncStore): string {
  return JSON.stringify([store.sampleMode, store.limits, store.schedules, focusKey(store.focus), store.preferences.notifications]);
}
function restrictionRules(store: SyncStore, now: number): device.NativeRestriction[] {
  if (store.sampleMode) return [];
  const rules: device.NativeRestriction[] = [
    ...store.limits.map((limit) => ({ id: limit.id, appIds: [limit.appId], kind: 'daily' as const, enabled: limit.enabled, dailyMinutes: limit.minutes })),
    ...store.schedules.map((schedule) => ({
      id: schedule.id, appIds: schedule.appIds, kind: 'schedule' as const, enabled: schedule.enabled,
      days: schedule.days, startMinute: Number(schedule.startTime.slice(0, 2)) * 60 + Number(schedule.startTime.slice(3)),
      endMinute: Number(schedule.endTime.slice(0, 2)) * 60 + Number(schedule.endTime.slice(3)),
    })),
  ];
  if (store.focus?.appIds.length && ((store.focus.status === 'active' && store.focus.endsAt > now) || store.focus.status === 'paused')) {
    // Keep a disabled rule so Android's background Resume action can restore it.
    rules.push({ id: store.focus.id, appIds: store.focus.appIds, kind: 'until', enabled: store.focus.status === 'active', until: store.focus.endsAt });
  }
  return rules;
}

/** Serializes native reads/writes so foreground notification actions win over stale React state. */
export function createDeviceCoordinator(options: {
  getStore(): SyncStore;
  bridge: SyncBridge;
  onChange(state: DeviceSyncState): void;
  now?: () => number;
}) {
  const { bridge, getStore, onChange } = options;
  const now = options.now ?? Date.now;
  let state = { ...initialSyncState };
  let disposed = false;
  let pendingRefresh = false;
  let pendingSync = false;
  let running: Promise<void> | null = null;
  let lastRulesKey: string | null = null;
  let lastLocalFocusKey: string | null = null;
  let nativeCountdown: device.NativeCountdownState | null | undefined;
  let managedCountdownId: string | null = null;
  let errorStage: 'refresh' | 'usage' | 'restriction' | 'countdown' | null = null;
  const publish = (updates: Partial<DeviceSyncState>) => {
    state = { ...state, ...updates };
    if (!disposed) onChange(state);
  };
  const fail = (error: unknown, fallback: string, stage: NonNullable<typeof errorStage>) => {
    errorStage = stage;
    publish({ error: error instanceof Error ? error.message : fallback });
  };
  const clearError = (stage: NonNullable<typeof errorStage>) => {
    if (errorStage === stage) { errorStage = null; publish({ error: null }); }
  };

  async function reconcileTerminalAction() {
    if (getStore().sampleMode || !bridge.getNativeCountdownAction) return;
    const action = await bridge.getNativeCountdownAction();
    if (!action || disposed || getStore().sampleMode) return;
    if (!action.id || !Number.isFinite(action.at) || (action.action !== 'stopped' && action.action !== 'expired')) throw new Error('The device returned an invalid countdown action.');
    const current = getStore();
    if (current.focus?.id === action.id) {
      if (action.action === 'stopped') await current.reconcileNativeCountdown(null);
      else await current.reconcileNativeCountdown({ id: action.id, endsAt: current.focus.endsAt, status: 'paused', remainingMs: 0 });
      managedCountdownId = null;
      nativeCountdown = null;
    }
    // An interrupted persistence attempt leaves the journal unacknowledged for retry.
    await bridge.acknowledgeNativeCountdownAction?.(action.at);
  }

  async function refreshDevice() {
    const before = getStore();
    const beforeFocus = focusKey(before.focus);
    const mayReconcile = lastLocalFocusKey === null || beforeFocus === lastLocalFocusKey;
    const capabilities = await bridge.getCapabilities();
    if (disposed) return;
    publish({ capabilities });
    lastRulesKey = null;
    if (capabilities.nativeModuleAvailable && capabilities.countdownNotifications) {
      await reconcileTerminalAction();
      nativeCountdown = await bridge.getNativeCountdownState();
      const current = getStore();
      const unchanged = before.sampleMode === current.sampleMode && beforeFocus === focusKey(current.focus);
      if (mayReconcile && unchanged && !current.sampleMode && current.preferences.notifications) {
        if (nativeCountdown && current.focus?.id === nativeCountdown.id) {
          managedCountdownId = nativeCountdown.id;
          await current.reconcileNativeCountdown(nativeCountdown);
        } else if (nativeCountdown === null && current.focus?.id === managedCountdownId) {
          await current.tickFocus();
          const latest = getStore();
          if (latest.focus?.status === 'active' || latest.focus?.status === 'paused') await latest.reconcileNativeCountdown(null);
          managedCountdownId = null;
        }
      }
    }
    clearError('refresh');
    if (capabilities.usageTracking && capabilities.usageAccessGranted) {
      try {
        const until = now();
        const since = new Date(until);
        since.setDate(since.getDate() - 7);
        const records = await bridge.readUsageSessions(since.getTime(), until);
        if (!disposed) await getStore().recordSessions(records);
        clearError('usage');
      } catch (error) {
        // Usage-history errors must not prevent the user from clearing restrictions.
        fail(error, 'Could not read device usage.', 'usage');
      }
    }
  }

  async function syncCountdown(capabilities: device.DeviceCapabilities) {
    if (!capabilities.nativeModuleAvailable || !capabilities.countdownNotifications) return;
    const current = getStore();
    const focus = current.focus;
    const enabled = !current.sampleMode && current.preferences.notifications &&
      (capabilities.notificationsGranted || capabilities.liveActivity);
    if (enabled && focus?.status === 'active' && focus.endsAt > now()) {
      if (nativeCountdown?.id === focus.id && nativeCountdown.status === 'running' && nativeCountdown.endsAt === focus.endsAt) {
        managedCountdownId = focus.id;
        return;
      }
      await bridge.startNativeCountdown({ id: focus.id, title: 'A little time for you', endsAt: focus.endsAt });
      managedCountdownId = focus.id;
      nativeCountdown = { id: focus.id, title: 'A little time for you', endsAt: focus.endsAt, remainingMs: Math.max(0, focus.endsAt - now()), status: 'running' };
      return;
    }
    // Preserve Android's native Resume action after its notification is paused.
    if (enabled && focus?.status === 'paused' && nativeCountdown?.id === focus.id && nativeCountdown.status === 'paused') {
      managedCountdownId = focus.id;
      return;
    }
    // Cleanup also works after notification permission is revoked. A timer paused
    // inside Orbit can resume there without leaving a running system notification.
    if (nativeCountdown !== null || managedCountdownId !== null) await bridge.stopNativeCountdown();
    nativeCountdown = null;
    managedCountdownId = null;
  }

  async function syncLatestPlan() {
    const capabilities = state.capabilities;
    if (!capabilities || !getStore().hydrated) return;
    // Also reconcile on leaving demo or editing a plan while already foregrounded.
    if (capabilities.nativeModuleAvailable && capabilities.countdownNotifications) await reconcileTerminalAction();
    while (!disposed) {
      await getStore().tickFocus();
      const current = getStore();
      const expectedPlan = planKey(current);
      const rules = restrictionRules(current, now());
      const rulesKey = JSON.stringify([current.sampleMode, rules]);
      const canWrite = capabilities.nativeModuleAvailable && capabilities.blocking &&
        (current.sampleMode || capabilities.blockingAccessGranted);
      let status: RestrictionSyncStatus = current.sampleMode ? 'preview' : 'unavailable';
      let restrictionsWritten = false;
      if (canWrite) {
        if (lastRulesKey !== rulesKey) {
          publish({ restrictionStatus: 'pending', restrictionsSynced: false });
          try {
            await bridge.syncRestrictions({ rules });
            lastRulesKey = rulesKey;
            restrictionsWritten = true;
            clearError('restriction');
          } catch (error) {
            publish({ restrictionStatus: 'failed', restrictionsSynced: false });
            fail(error, 'Could not apply device restrictions.', 'restriction');
            try { await syncCountdown(capabilities); clearError('countdown'); }
            catch (notificationError) { fail(notificationError, 'Could not update the countdown notification.', 'countdown'); }
            return;
          }
        }
        status = current.sampleMode ? 'preview' : 'synced';
      } else lastRulesKey = null;
      // Apply a demo toggle or plan edit made during a native write before showing success.
      if (planKey(getStore()) !== expectedPlan) continue;
      try { await syncCountdown(capabilities); clearError('countdown'); }
      catch (error) { fail(error, 'Could not update the countdown notification.', 'countdown'); }
      if (planKey(getStore()) !== expectedPlan) continue;
      lastLocalFocusKey = focusKey(getStore().focus);
      publish({ restrictionStatus: status, restrictionsSynced: status === 'synced', ...(restrictionsWritten ? { lastSyncedAt: now() } : {}) });
      return;
    }
  }

  function request(refresh: boolean): Promise<void> {
    if (disposed || !getStore().hydrated) return Promise.resolve();
    pendingRefresh ||= refresh;
    pendingSync = true;
    publish({ syncing: true, restrictionStatus: 'pending', restrictionsSynced: false });
    if (!running) {
      running = Promise.resolve().then(async () => {
        while (!disposed && (pendingRefresh || pendingSync)) {
          const shouldRefresh = pendingRefresh || state.capabilities === null;
          pendingRefresh = false;
          pendingSync = false;
          try {
            if (shouldRefresh) await refreshDevice();
            if (!disposed) await syncLatestPlan();
          } catch (error) {
            publish({ restrictionStatus: 'failed', restrictionsSynced: false });
            fail(error, 'Could not connect to this device.', 'refresh');
          }
        }
      }).finally(() => { running = null; publish({ syncing: false }); });
    }
    return running;
  }
  return {
    refresh: () => request(true), sync: () => request(false),
    dispose: () => { disposed = true; pendingRefresh = false; pendingSync = false; },
  };
}

export function DeviceProvider({ children }: React.PropsWithChildren) {
  const [state, setState] = useState<DeviceSyncState>(initialSyncState);
  const coordinator = useRef<ReturnType<typeof createDeviceCoordinator> | null>(null);
  const { hydrated, sampleMode, limits, schedules, focus, preferences } = useAppStore();
  const refresh = useCallback(async () => { await coordinator.current?.refresh(); }, []);
  useEffect(() => {
    if (!hydrated) return;
    const current = createDeviceCoordinator({ getStore: useAppStore.getState, bridge: device, onChange: setState });
    coordinator.current = current;
    // Start the external synchronization outside the React effect's synchronous phase.
    void Promise.resolve().then(() => current.refresh());
    const subscription = AppState.addEventListener('change', (next) => { if (next === 'active') void current.refresh(); });
    return () => { subscription.remove(); current.dispose(); if (coordinator.current === current) coordinator.current = null; };
  }, [hydrated]);
  useEffect(() => {
    if (hydrated) void Promise.resolve().then(() => coordinator.current?.sync());
  }, [hydrated, sampleMode, limits, schedules, focus, preferences.notifications]);
  useEffect(() => {
    if (!hydrated) return;
    const timer = setInterval(() => { void useAppStore.getState().tickFocus().catch(() => {}); }, 1000);
    return () => clearInterval(timer);
  }, [hydrated]);
  return <DeviceContext.Provider value={{ ...state, refresh }}>{children}</DeviceContext.Provider>;
}

export function useNow(active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
