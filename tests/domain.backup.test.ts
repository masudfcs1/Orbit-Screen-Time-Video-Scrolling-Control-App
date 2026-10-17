import { describe, expect, it } from 'vitest';
import { createBackup, previewBackup, restoreBackup, validateBackup } from '../src/domain/backup';
import { createFocus } from '../src/domain/countdown';
import { emptyData } from '../src/domain/defaults';

describe('versioned local backups', () => {
  it('round trips a full schema and offers a validated preview', () => {
    const data = emptyData();
    data.sessions = [{ id: 'session-a', appId: 'youtube', startedAt: 1000, endedAt: 61_000 }];
    const backup = createBackup(data, 1000);
    expect(validateBackup(backup).data).toEqual(data);
    expect(previewBackup(backup)).toMatchObject({ sessions: 1, limits: 0, schedules: 0, exportedAt: '1970-01-01T00:00:01.000Z' });
  });

  it('rejects invalid JSON, unsupported versions, and unknown app references', () => {
    expect(() => validateBackup('{')).toThrow('valid JSON');
    const backup = JSON.parse(createBackup(emptyData()));
    expect(() => validateBackup({ ...backup, version: 99 })).toThrow('not supported');
    backup.data.sessions = [{ id: 'bad', appId: 'unknown', startedAt: 0, endedAt: 1000 }];
    expect(() => validateBackup(backup)).toThrow('Unknown app reference');
  });

  it('does not mutate current records when validation fails', () => {
    const current = emptyData();
    const before = JSON.stringify(current);
    const malformed = JSON.parse(createBackup(emptyData()));
    malformed.data.preferences.dailyGoalMinutes = -1;
    expect(() => restoreBackup(current, malformed, 'replace')).toThrow('Daily goal');
    expect(JSON.stringify(current)).toBe(before);
  });

  it('merges duplicate sessions once and preserves current preferences', () => {
    const current = emptyData();
    current.preferences.dailyGoalMinutes = 120;
    current.sessions = [{ id: 'one', appId: 'youtube', startedAt: 1000, endedAt: 61_000 }];
    const incoming = emptyData();
    incoming.sessions = [...current.sessions, { id: 'two', appId: 'instagram', startedAt: 70_000, endedAt: 130_000 }];
    expect(restoreBackup(current, createBackup(incoming), 'merge')).toMatchObject({ sessions: incoming.sessions, preferences: { dailyGoalMinutes: 120 } });
    expect(restoreBackup(current, createBackup(incoming), 'replace').preferences.dailyGoalMinutes).toBe(180);
  });

  it('reconciles expired restored countdowns', () => {
    const incoming = emptyData();
    incoming.focus = createFocus(1, ['youtube'], 1000);
    expect(restoreBackup(emptyData(), createBackup(incoming), 'replace', 61_000).focus?.status).toBe('completed');
  });
});
