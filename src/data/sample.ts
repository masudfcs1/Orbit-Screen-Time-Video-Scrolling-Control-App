import { emptyData } from '../domain/defaults';
import type { PersistentData, UsageSession } from '../domain/types';

/** Explicit preview data. Never stored in the real usage repository or backup. */
export function createSampleData(now = Date.now()): PersistentData {
  const data = emptyData();
  const sessions: UsageSession[] = [];
  const ids = ['instagram', 'youtube', 'tiktok', 'facebook'];
  const todayMinutes = [63, 42, 26, 11];
  for (let offset = 30; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setHours(7, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const multiplier = offset === 0 ? 1 : offset === 1 ? 1.38 : 0.72 + ((offset * 17) % 57) / 100;
    let cursor = date.getTime();
    for (let round = 0; round < 3; round += 1) {
      ids.forEach((appId, index) => {
        const minutes = Math.round(todayMinutes[index]! * multiplier / 3);
        const endedAt = cursor + minutes * 60_000;
        sessions.push({ id: `sample-${offset}-${round}-${appId}`, appId, startedAt: cursor, endedAt });
        cursor = endedAt + (13 + round * 7) * 60_000;
      });
    }
  }
  data.sessions = sessions;
  data.limits = [
    { id: 'sample-limit-instagram', appId: 'instagram', minutes: 90, enabled: true },
    { id: 'sample-limit-youtube', appId: 'youtube', minutes: 60, enabled: true },
    { id: 'sample-limit-tiktok', appId: 'tiktok', minutes: 30, enabled: true },
  ];
  data.schedules = [
    { id: 'sample-evening', name: 'Evening unwind', startTime: '22:00', endTime: '07:00', days: [0, 1, 2, 3, 4, 5, 6], appIds: ['instagram', 'youtube', 'tiktok'], enabled: true },
    { id: 'sample-deep-work', name: 'Deep work', startTime: '09:00', endTime: '11:00', days: [1, 2, 3, 4, 5], appIds: ['instagram', 'tiktok', 'facebook'], enabled: true },
  ];
  return data;
}
