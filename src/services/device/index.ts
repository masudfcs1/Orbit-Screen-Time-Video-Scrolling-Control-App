import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type { DeviceBridge, DeviceCapabilities, NativeCountdown, NativeRestrictionPayload } from './types';
import { DeviceIntegrationError, validateCountdown, validateRange, validateRestrictions } from './validation';

export * from './types';
export { DeviceIntegrationError } from './validation';

// Expo Go and web deliberately have no substitute for these privileged native APIs.
const native = Platform.OS === 'web' ? null : requireOptionalNativeModule<DeviceBridge>('OrbitDevice');

function bridge(): DeviceBridge {
  if (!native) {
    throw new DeviceIntegrationError('NATIVE_BUILD_REQUIRED', Platform.OS === 'web'
      ? 'Device tracking and app blocking require the installed Android or iOS app.'
      : 'Install an Orbit development build to connect device permissions. Expo Go cannot load this integration.');
  }
  return native;
}

async function call<T>(action: (module: DeviceBridge) => Promise<T>): Promise<T> {
  try { return await action(bridge()); }
  catch (error) {
    if (error instanceof DeviceIntegrationError) throw error;
    const failure = error as { code?: string; message?: string };
    throw new DeviceIntegrationError(failure?.code ?? 'NATIVE_FAILURE', failure?.message ?? 'The device integration could not complete this action.');
  }
}

export async function getCapabilities(): Promise<DeviceCapabilities> {
  if (native) return call(module => module.getCapabilities());
  return {
    platform: Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'unsupported',
    nativeModuleAvailable: false,
    usageTracking: false,
    usageAccessGranted: false,
    notificationsGranted: false,
    countdownNotifications: false,
    blocking: false,
    blockingAccessGranted: false,
    screenTimeAuthorized: false,
    liveActivity: false,
    exactVideoCounts: false,
    limitations: [Platform.OS === 'web'
      ? 'Web cannot inspect other apps or enforce device restrictions. Connect the installed mobile app.'
      : 'A custom Orbit native build is required; these APIs are unavailable in Expo Go.',
    'Individual video views are not exposed by standard screen-time APIs.'],
  };
}

export const requestUsageAccess = () => call(module => module.requestUsageAccess());
export const discoverMonitoredApps = () => call(module => module.discoverMonitoredApps());
export const requestNotificationPermission = () => call(module => module.requestNotificationPermission());
export const requestScreenTimeAuthorization = () => call(module => module.requestScreenTimeAuthorization());
export const presentScreenTimePicker = () => call(module => module.presentScreenTimePicker());
export const stopNativeCountdown = () => call(module => module.stopNativeCountdown());
export const getNativeCountdownState = () => call(module => module.getNativeCountdownState());
export const getNativeCountdownAction = () => call(module => module.getNativeCountdownAction?.() ?? Promise.resolve(null));
export const acknowledgeNativeCountdownAction = (at: number) => call(module => module.acknowledgeNativeCountdownAction?.(at) ?? Promise.resolve());

export async function readUsageSessions(since: number, until: number) {
  validateRange(since, until);
  return call(module => module.readUsageSessions(since, until));
}

export async function startNativeCountdown(options: NativeCountdown) {
  validateCountdown(options);
  return call(module => module.startNativeCountdown(options));
}

export async function requestBlockingAccess(consent: boolean) {
  if (!consent) throw new DeviceIntegrationError('CONSENT_REQUIRED', 'Please read and accept the app-blocking disclosure first.');
  return call(module => module.requestBlockingAccess(consent));
}

export async function syncRestrictions(payload: NativeRestrictionPayload) {
  validateRestrictions(payload);
  return call(module => module.syncRestrictions(payload));
}
