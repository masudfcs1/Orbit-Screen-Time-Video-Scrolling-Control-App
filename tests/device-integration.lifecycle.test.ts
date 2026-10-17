import { describe, expect, it, vi } from 'vitest';
import { createFocus, reconcileFocus } from '../src/domain/countdown';
import { emptyData } from '../src/domain/defaults';
import type { NativeCountdownSnapshot } from '../src/domain/types';
import type { DeviceCapabilities, NativeCountdownState } from '../src/services/device/types';

vi.mock('react-native', () => ({ AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) } }));
vi.mock('../src/services/device', () => ({}));
vi.mock('../src/store/useAppStore', () => ({ useAppStore: vi.fn() }));

const { createDeviceCoordinator } = await import('../src/hooks/useDevice');
type SyncStore = ReturnType<Parameters<typeof createDeviceCoordinator>[0]['getStore']>;
type SyncState = Parameters<Parameters<typeof createDeviceCoordinator>[0]['onChange']>[0];
const NOW = Date.UTC(2026, 9, 18, 12);

function harness() {
  let clock = NOW;
  let native: NativeCountdownState | null = null;
  let action: { id: string; action: 'stopped' | 'expired'; at: number } | null = null;
  const capabilities: DeviceCapabilities = {
    platform: 'android', nativeModuleAvailable: true, usageTracking: false, usageAccessGranted: false,
    notificationsGranted: true, countdownNotifications: true, blocking: true, blockingAccessGranted: true,
    screenTimeAuthorized: false, liveActivity: false, exactVideoCounts: false, limitations: [],
  };
  const store: SyncStore = {
    ...emptyData(), hydrated: true, sampleMode: false,
    preferences: { ...emptyData().preferences, notifications: true },
    focus: createFocus(30, ['youtube'], NOW, 'focus-1'),
    recordSessions: vi.fn(async () => {}),
    tickFocus: vi.fn(async () => { store.focus = reconcileFocus(store.focus, clock); }),
    reconcileNativeCountdown: vi.fn(async (value: NativeCountdownSnapshot | null) => {
      if (!store.focus) return;
      if (!value) { store.focus = { ...store.focus, status: 'cancelled' }; return; }
      if (value.id !== store.focus.id) return;
      const paused = value.status === 'paused' && value.remainingMs > 0;
      store.focus = { ...store.focus, endsAt: value.endsAt, status: paused ? 'paused' : value.status === 'paused' ? 'completed' : 'active', pausedAt: paused ? clock : null, remainingOnPause: paused ? value.remainingMs : null };
    }),
  };
  const bridge = {
    getCapabilities: vi.fn(async () => ({ ...capabilities })),
    getNativeCountdownState: vi.fn(async () => native),
    getNativeCountdownAction: vi.fn(async () => action),
    acknowledgeNativeCountdownAction: vi.fn(async (at: number) => { if (action?.at === at) action = null; }),
    readUsageSessions: vi.fn(async () => []),
    syncRestrictions: vi.fn(async (_payload: { rules: unknown[] }) => {}),
    startNativeCountdown: vi.fn(async (options: { id: string; title: string; endsAt: number }) => { native = { ...options, status: 'running', remainingMs: options.endsAt - clock }; }),
    stopNativeCountdown: vi.fn(async () => { native = null; }),
  };
  const states: SyncState[] = [];
  const coordinator = createDeviceCoordinator({ getStore: () => store, bridge, onChange: (state) => states.push(state), now: () => clock });
  return { store, bridge, capabilities, coordinator, states, last: () => states.at(-1)!, setNative: (value: NativeCountdownState | null) => { native = value; }, setAction: (value: typeof action) => { action = value; }, setClock: (value: number) => { clock = value; } };
}

describe('device lifecycle synchronization', () => {
  it('reads a native pause before outbound sync and preserves its Resume notification', async () => {
    const app = harness();
    app.setNative({ id: 'focus-1', title: 'Focus', endsAt: app.store.focus!.endsAt, remainingMs: 60_000, status: 'paused' });
    await app.coordinator.refresh();
    expect(app.store.focus?.status).toBe('paused');
    expect(app.bridge.startNativeCountdown).not.toHaveBeenCalled();
    expect(app.bridge.stopNativeCountdown).not.toHaveBeenCalled();
    expect(app.bridge.syncRestrictions).toHaveBeenLastCalledWith({ rules: [expect.objectContaining({ id: 'focus-1', enabled: false, kind: 'until' })] });
    expect(app.last()).toMatchObject({ restrictionStatus: 'synced', restrictionsSynced: true });
  });

  it('reconciles notification resume and a confirmed stop without resurrecting restrictions', async () => {
    const app = harness();
    await app.coordinator.refresh();
    app.setNative({ id: 'focus-1', title: 'Focus', endsAt: NOW + 120_000, remainingMs: 120_000, status: 'running' });
    await app.coordinator.refresh();
    expect(app.store.focus?.endsAt).toBe(NOW + 120_000);
    app.setNative(null);
    await app.coordinator.refresh();
    expect(app.store.focus?.status).toBe('cancelled');
    expect(app.bridge.syncRestrictions).toHaveBeenLastCalledWith({ rules: [] });
    expect(app.bridge.startNativeCountdown).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite a pending UI pause with an older running native snapshot', async () => {
    const app = harness();
    await app.coordinator.refresh();
    app.store.focus = { ...app.store.focus!, status: 'paused', pausedAt: NOW, remainingOnPause: 120_000 };
    await app.coordinator.refresh();
    expect(app.store.focus?.status).toBe('paused');
    expect(app.bridge.stopNativeCountdown).toHaveBeenCalledTimes(1);
    expect(app.bridge.syncRestrictions).toHaveBeenLastCalledWith({ rules: [expect.objectContaining({ id: 'focus-1', enabled: false, kind: 'until' })] });
  });

  it('clears an in-flight real plan on entering demo and never sends sample restrictions', async () => {
    const app = harness();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    app.bridge.syncRestrictions.mockImplementationOnce(async () => pending);
    const refresh = app.coordinator.refresh();
    await vi.waitFor(() => expect(app.bridge.syncRestrictions).toHaveBeenCalledTimes(1));
    app.store.sampleMode = true;
    app.store.limits = [{ id: 'sample-limit', appId: 'youtube', minutes: 10, enabled: true }];
    const switchMode = app.coordinator.sync();
    expect(app.last().restrictionsSynced).toBe(false);
    finish();
    await Promise.all([refresh, switchMode]);
    expect(app.bridge.syncRestrictions).toHaveBeenLastCalledWith({ rules: [] });
    expect(JSON.stringify(app.bridge.syncRestrictions.mock.calls)).not.toContain('sample-limit');
    expect(app.bridge.startNativeCountdown).not.toHaveBeenCalled();
    expect(app.last().restrictionStatus).toBe('preview');
    app.store.sampleMode = false;
    app.store.limits = [];
    await app.coordinator.sync();
    expect(app.bridge.startNativeCountdown).toHaveBeenCalledTimes(1);
    expect(app.last().restrictionsSynced).toBe(true);
  });

  it('reports permission separately from successful restriction application and retries failures', async () => {
    const app = harness();
    app.bridge.syncRestrictions.mockRejectedValueOnce(new Error('Native commit failed'));
    await app.coordinator.refresh();
    expect(app.last()).toMatchObject({ capabilities: { blockingAccessGranted: true }, restrictionsSynced: false, restrictionStatus: 'failed', error: 'Native commit failed' });
    await app.coordinator.refresh();
    expect(app.last()).toMatchObject({ restrictionsSynced: true, restrictionStatus: 'synced', error: null, lastSyncedAt: NOW });
  });

  it('cleans up a notification after permission revocation while keeping the saved focus restriction', async () => {
    const app = harness();
    await app.coordinator.refresh();
    app.capabilities.notificationsGranted = false;
    await app.coordinator.refresh();
    expect(app.bridge.stopNativeCountdown).toHaveBeenCalledTimes(1);
    expect(app.store.focus?.status).toBe('active');
    expect(app.bridge.syncRestrictions).toHaveBeenLastCalledWith({ rules: [expect.objectContaining({ id: 'focus-1', kind: 'until' })] });
  });

  it('still clears restrictions when usage history fails, without hiding the error', async () => {
    const app = harness();
    app.capabilities.usageTracking = true;
    app.capabilities.usageAccessGranted = true;
    app.store.sampleMode = true;
    app.bridge.readUsageSessions.mockRejectedValueOnce(new Error('Usage unavailable'));
    await app.coordinator.refresh();
    expect(app.bridge.syncRestrictions).toHaveBeenLastCalledWith({ rules: [] });
    expect(app.last()).toMatchObject({ restrictionStatus: 'preview', error: 'Usage unavailable' });
    await app.coordinator.sync();
    expect(app.last().error).toBe('Usage unavailable');
  });

  it('never overwrites an unknown native countdown state after a failed foreground read', async () => {
    const app = harness();
    app.bridge.getNativeCountdownState.mockRejectedValueOnce(new Error('Native state unavailable'));
    await app.coordinator.refresh();
    expect(app.bridge.startNativeCountdown).not.toHaveBeenCalled();
    expect(app.bridge.syncRestrictions).not.toHaveBeenCalled();
    expect(app.last().restrictionStatus).toBe('failed');
  });

  it('completes an expired native countdown instead of treating expiration as cancellation', async () => {
    const app = harness();
    await app.coordinator.refresh();
    app.setClock(NOW + 31 * 60_000);
    app.setNative(null);
    await app.coordinator.refresh();
    expect(app.store.focus?.status).toBe('completed');
    expect(app.bridge.syncRestrictions).toHaveBeenLastCalledWith({ rules: [] });
  });

  it('honors a persisted native stop after a cold JS restart before reapplying a plan', async () => {
    const app = harness();
    app.setAction({ id: 'focus-1', action: 'stopped', at: NOW });
    await app.coordinator.refresh();
    expect(app.store.focus?.status).toBe('cancelled');
    expect(app.bridge.startNativeCountdown).not.toHaveBeenCalled();
    expect(app.bridge.acknowledgeNativeCountdownAction).toHaveBeenCalledWith(NOW);
    expect(app.bridge.syncRestrictions).toHaveBeenLastCalledWith({ rules: [] });
  });

  it('retries an unacknowledged native action after a failed local commit', async () => {
    const app = harness();
    app.setAction({ id: 'focus-1', action: 'stopped', at: NOW });
    vi.mocked(app.store.reconcileNativeCountdown).mockRejectedValueOnce(new Error('Storage full'));
    await app.coordinator.refresh();
    expect(app.bridge.acknowledgeNativeCountdownAction).not.toHaveBeenCalled();
    expect(app.bridge.syncRestrictions).not.toHaveBeenCalled();
    await app.coordinator.refresh();
    expect(app.store.focus?.status).toBe('cancelled');
    expect(app.bridge.acknowledgeNativeCountdownAction).toHaveBeenCalledWith(NOW);
  });

  it('defers a real countdown journal in demo and reconciles it when the real plan returns', async () => {
    const app = harness();
    app.setAction({ id: 'focus-1', action: 'expired', at: NOW });
    app.store.sampleMode = true;
    await app.coordinator.refresh();
    expect(app.bridge.acknowledgeNativeCountdownAction).not.toHaveBeenCalled();
    app.store.sampleMode = false;
    await app.coordinator.sync();
    expect(app.store.focus?.status).toBe('completed');
    expect(app.bridge.startNativeCountdown).not.toHaveBeenCalled();
    expect(app.bridge.acknowledgeNativeCountdownAction).toHaveBeenCalledWith(NOW);
  });
});
