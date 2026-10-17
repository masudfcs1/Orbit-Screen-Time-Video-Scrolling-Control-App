import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceIntegrationError, validateCountdown, validateRange, validateRestrictions } from './validation';
import type { DeviceBridge, DeviceCapabilities } from './types';

const environment = vi.hoisted(() => ({ platform: { OS: 'web' }, native: null as DeviceBridge | null }));
vi.mock('react-native', () => ({ Platform: environment.platform }));
vi.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => environment.native }));

const capabilities: DeviceCapabilities = {
  platform: 'android', nativeModuleAvailable: true, usageTracking: true,
  usageAccessGranted: false, notificationsGranted: false, countdownNotifications: true,
  blocking: true, blockingAccessGranted: false, screenTimeAuthorized: false,
  liveActivity: false, exactVideoCounts: false, limitations: ['Usage Access is required.'],
};

function fakeBridge(): DeviceBridge {
  return {
    getCapabilities: vi.fn().mockResolvedValue(capabilities),
    requestUsageAccess: vi.fn().mockResolvedValue(undefined),
    readUsageSessions: vi.fn().mockResolvedValue([]),
    discoverMonitoredApps: vi.fn().mockResolvedValue([]),
    requestNotificationPermission: vi.fn().mockResolvedValue(false),
    startNativeCountdown: vi.fn().mockResolvedValue(undefined),
    stopNativeCountdown: vi.fn().mockResolvedValue(undefined),
    getNativeCountdownState: vi.fn().mockResolvedValue(null),
    requestBlockingAccess: vi.fn().mockResolvedValue(undefined),
    syncRestrictions: vi.fn().mockResolvedValue(undefined),
    requestScreenTimeAuthorization: vi.fn().mockResolvedValue(undefined),
    presentScreenTimePicker: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.resetModules();
  environment.platform.OS = 'web';
  environment.native = null;
});

describe('device capability boundary', () => {
  it('reports web as unavailable and refuses to invent usage records', async () => {
    const device = await import('./index');
    expect(await device.getCapabilities()).toMatchObject({ platform: 'web', nativeModuleAvailable: false, usageTracking: false, blocking: false, exactVideoCounts: false });
    await expect(device.readUsageSessions(1, 100)).rejects.toMatchObject({ code: 'NATIVE_BUILD_REQUIRED' });
    await expect(device.syncRestrictions({ rules: [] })).rejects.toMatchObject({ code: 'NATIVE_BUILD_REQUIRED' });
  });

  it('handles Expo Go without crashing module import', async () => {
    environment.platform.OS = 'android';
    const device = await import('./index');
    expect((await device.getCapabilities()).nativeModuleAvailable).toBe(false);
    await expect(device.requestUsageAccess()).rejects.toMatchObject({ code: 'NATIVE_BUILD_REQUIRED' });
  });

  it('keeps denied permission separate from native API availability', async () => {
    environment.platform.OS = 'android';
    environment.native = fakeBridge();
    const device = await import('./index');
    expect(await device.getCapabilities()).toEqual(capabilities);
    expect(await device.requestNotificationPermission()).toBe(false);
  });

  it('preserves a permission error rather than returning an empty successful query', async () => {
    environment.platform.OS = 'android';
    environment.native = fakeBridge();
    vi.mocked(environment.native.readUsageSessions).mockRejectedValue({ code: 'USAGE_ACCESS_DENIED', message: 'Enable Usage Access.' });
    const device = await import('./index');
    await expect(device.readUsageSessions(1, 100)).rejects.toMatchObject({ name: 'DeviceIntegrationError', code: 'USAGE_ACCESS_DENIED', message: 'Enable Usage Access.' });
  });

  it('requires explicit consent before invoking accessibility access', async () => {
    environment.platform.OS = 'android';
    environment.native = fakeBridge();
    const device = await import('./index');
    await expect(device.requestBlockingAccess(false)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(environment.native.requestBlockingAccess).not.toHaveBeenCalled();
    await device.requestBlockingAccess(true);
    expect(environment.native.requestBlockingAccess).toHaveBeenCalledWith(true);
  });

  it('does not call native code when a range is invalid', async () => {
    environment.platform.OS = 'android';
    environment.native = fakeBridge();
    const device = await import('./index');
    await expect(device.readUsageSessions(100, 1)).rejects.toMatchObject({ code: 'INVALID_RANGE' });
    expect(environment.native.readUsageSessions).not.toHaveBeenCalled();
  });
});

describe('native input validation', () => {
  it('rejects non-finite, reversed and empty query intervals', () => {
    for (const [since, until] of [[NaN, 2], [1, Infinity], [2, 1], [-1, 2], [3, 3]] as const) {
      expect(() => validateRange(since, until)).toThrow(DeviceIntegrationError);
    }
    expect(() => validateRange(0, 1)).not.toThrow();
  });

  it('rejects expired timers and timers longer than the supported native lifetime', () => {
    expect(() => validateCountdown({ id: 'focus', title: 'Focus', endsAt: 999 }, 1000)).toThrow();
    expect(() => validateCountdown({ id: 'focus', title: 'Focus', endsAt: 28_801_001 }, 1000)).toThrow();
    expect(() => validateCountdown({ id: 'focus', title: 'Focus', endsAt: 61_000 }, 1000)).not.toThrow();
  });

  it('accepts overnight schedules and rejects ambiguous whole-day windows', () => {
    const rule = { id: 'bedtime', appIds: ['youtube'], kind: 'schedule' as const, enabled: true, days: [1, 2, 3], startMinute: 1320, endMinute: 420 };
    expect(() => validateRestrictions({ rules: [rule] })).not.toThrow();
    expect(() => validateRestrictions({ rules: [{ ...rule, endMinute: 1320 }] })).toThrow();
    expect(() => validateRestrictions({ rules: [{ ...rule, days: [7] }] })).toThrow();
  });

  it('rejects duplicate restriction IDs and unsupported allowance values', () => {
    const rule = { id: 'daily', appIds: ['instagram'], kind: 'daily' as const, enabled: true, dailyMinutes: 30 };
    expect(() => validateRestrictions({ rules: [rule, rule] })).toThrow();
    expect(() => validateRestrictions({ rules: [{ ...rule, dailyMinutes: 0 }] })).toThrow();
    expect(() => validateRestrictions({ rules: [{ ...rule, dailyMinutes: 1441 }] })).toThrow();
    expect(() => validateRestrictions({ rules: [{ ...rule, appIds: [] }] })).toThrow();
  });
});
