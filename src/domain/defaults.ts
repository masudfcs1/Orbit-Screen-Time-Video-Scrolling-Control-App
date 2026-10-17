import type { AppInfo, PersistentData, Preferences } from './types';

export const DEFAULT_APPS: AppInfo[] = [
  { id: 'instagram', name: 'Instagram', color: '#CF5288', icon: 'instagram', category: 'Social' },
  { id: 'youtube', name: 'YouTube', color: '#E65959', icon: 'youtube', category: 'Video' },
  { id: 'tiktok', name: 'TikTok', color: '#293539', icon: 'music-2', category: 'Video' },
  { id: 'facebook', name: 'Facebook', color: '#4D80DC', icon: 'facebook', category: 'Social' },
];

export const DEFAULT_PREFERENCES: Preferences = {
  dailyGoalMinutes: 180,
  weeklyGoalMinutes: 1260,
  defaultFocusMinutes: 25,
  theme: 'light',
  notifications: false,
};

export function emptyData(): PersistentData {
  return {
    apps: DEFAULT_APPS.map((app) => ({ ...app })),
    sessions: [],
    limits: [],
    schedules: [],
    focus: null,
    preferences: { ...DEFAULT_PREFERENCES },
  };
}
