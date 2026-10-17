export interface DeviceCapabilities {
  platform: 'android' | 'ios' | 'web' | 'unsupported';
  nativeModuleAvailable: boolean;
  usageTracking: boolean;
  usageAccessGranted: boolean;
  notificationsGranted: boolean;
  countdownNotifications: boolean;
  blocking: boolean;
  blockingAccessGranted: boolean;
  screenTimeAuthorized: boolean;
  liveActivity: boolean;
  exactVideoCounts: false;
  limitations: string[];
}

export interface DeviceUsageSession {
  id: string;
  appId: string;
  startedAt: number;
  endedAt: number;
  source: 'android-usage-events';
  isOngoing: boolean;
}

export interface DeviceApplication {
  id: string;
  name: string;
  platform: 'android' | 'ios';
  installed: boolean;
}

export interface NativeCountdown {
  id: string;
  title: string;
  endsAt: number;
}

export interface NativeCountdownState extends NativeCountdown {
  status: 'running' | 'paused';
  remainingMs: number;
}

/** Persisted Android notification action; acknowledge only after local state is saved. */
export interface NativeCountdownAction {
  id: string;
  action: 'stopped' | 'expired';
  at: number;
}

/** Days are 0 (Sunday) through 6 (Saturday); minute values use device local time. */
export interface NativeRestriction {
  id: string;
  appIds: string[];
  kind: 'until' | 'daily' | 'schedule';
  enabled: boolean;
  until?: number;
  dailyMinutes?: number;
  days?: number[];
  startMinute?: number;
  endMinute?: number;
}

export interface NativeRestrictionPayload { rules: NativeRestriction[] }

export interface DeviceBridge {
  getCapabilities(): Promise<DeviceCapabilities>;
  requestUsageAccess(): Promise<void>;
  readUsageSessions(since: number, until: number): Promise<DeviceUsageSession[]>;
  discoverMonitoredApps(): Promise<DeviceApplication[]>;
  requestNotificationPermission(): Promise<boolean>;
  startNativeCountdown(options: NativeCountdown): Promise<void>;
  stopNativeCountdown(): Promise<void>;
  getNativeCountdownState(): Promise<NativeCountdownState | null>;
  getNativeCountdownAction?(): Promise<NativeCountdownAction | null>;
  acknowledgeNativeCountdownAction?(at: number): Promise<void>;
  requestBlockingAccess(consent: boolean): Promise<void>;
  syncRestrictions(payload: NativeRestrictionPayload): Promise<void>;
  requestScreenTimeAuthorization(): Promise<void>;
  presentScreenTimePicker(): Promise<void>;
}
