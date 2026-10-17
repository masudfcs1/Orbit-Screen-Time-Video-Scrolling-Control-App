import type { NativeCountdown, NativeRestrictionPayload } from './types';

export class DeviceIntegrationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DeviceIntegrationError';
    this.code = code;
  }
}

export function validateRange(since: number, until: number): void {
  if (!Number.isFinite(since) || !Number.isFinite(until) || since < 0 || until <= since) {
    throw new DeviceIntegrationError('INVALID_RANGE', 'Choose a valid start and end time.');
  }
}

export function validateCountdown(options: NativeCountdown, now = Date.now()): void {
  if (!options.id.trim() || !options.title.trim() || !Number.isFinite(options.endsAt) || options.endsAt <= now) {
    throw new DeviceIntegrationError('INVALID_COUNTDOWN', 'The countdown needs a name and a future end time.');
  }
  if (options.endsAt - now > 8 * 60 * 60 * 1000) {
    throw new DeviceIntegrationError('INVALID_COUNTDOWN', 'Native countdowns can run for up to 8 hours.');
  }
}

export function validateRestrictions(payload: NativeRestrictionPayload): void {
  const ids = new Set<string>();
  for (const rule of payload.rules) {
    if (!rule.id || ids.has(rule.id) || !rule.appIds.length) {
      throw new DeviceIntegrationError('INVALID_RESTRICTION', 'Every restriction needs a unique ID and at least one app.');
    }
    ids.add(rule.id);
    if (rule.kind === 'until' && (!Number.isFinite(rule.until) || (rule.until ?? 0) <= 0)) {
      throw new DeviceIntegrationError('INVALID_RESTRICTION', 'The restriction needs a valid end time.');
    }
    if (rule.kind === 'daily' && (!Number.isFinite(rule.dailyMinutes) || (rule.dailyMinutes ?? 0) < 1 || (rule.dailyMinutes ?? 0) > 1440)) {
      throw new DeviceIntegrationError('INVALID_RESTRICTION', 'Daily allowances must be between 1 and 1440 minutes.');
    }
    if (rule.kind === 'schedule') {
      const minutes = [rule.startMinute, rule.endMinute];
      if (!rule.days?.length || rule.days.some(day => !Number.isInteger(day) || day < 0 || day > 6) ||
          minutes.some(value => value === undefined || !Number.isInteger(value) || value < 0 || value > 1439) ||
          rule.startMinute === rule.endMinute) {
        throw new DeviceIntegrationError('INVALID_RESTRICTION', 'Choose schedule days and distinct start and end times.');
      }
    }
  }
}
