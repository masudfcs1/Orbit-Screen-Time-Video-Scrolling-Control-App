export interface AppInfo {
  id: string;
  name: string;
  color: string;
  icon: string;
  category: string;
}

export interface UsageSession {
  id: string;
  appId: string;
  startedAt: number;
  endedAt: number;
}

export interface AppLimit {
  id: string;
  appId: string;
  minutes: number;
  enabled: boolean;
}

export interface FocusSession {
  id: string;
  startedAt: number;
  endsAt: number;
  pausedAt: number | null;
  remainingOnPause: number | null;
  durationMinutes: number;
  appIds: string[];
  status: 'active' | 'paused' | 'completed' | 'cancelled';
}

/** Weekdays use JavaScript's local convention: Sunday = 0, Saturday = 6. */
export interface Schedule {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  days: number[];
  appIds: string[];
  enabled: boolean;
}

export interface Preferences {
  dailyGoalMinutes: number;
  weeklyGoalMinutes: number;
  defaultFocusMinutes: number;
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
}

export interface PersistentData {
  apps: AppInfo[];
  sessions: UsageSession[];
  limits: AppLimit[];
  schedules: Schedule[];
  focus: FocusSession | null;
  preferences: Preferences;
}

export interface AppState extends PersistentData {
  sampleMode: boolean;
  hydrated: boolean;
}

export interface BackupData {
  format: 'orbit.local-backup';
  version: 1;
  exportedAt: string;
  data: PersistentData;
}

export interface StoredData {
  data: PersistentData;
  sampleMode: boolean;
}

export interface NativeCountdownSnapshot {
  id: string;
  endsAt: number;
  status: 'running' | 'paused';
  remainingMs: number;
}
