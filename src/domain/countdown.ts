import type { FocusSession } from './types';

export function remainingFocusMilliseconds(focus: FocusSession | null, now = Date.now()): number {
  if (!focus || focus.status === 'completed' || focus.status === 'cancelled') return 0;
  return Math.max(0, Math.min(focus.durationMinutes * 60_000, focus.status === 'paused' ? focus.remainingOnPause ?? 0 : focus.endsAt - now));
}

export function createFocus(minutes: number, appIds: string[], now = Date.now(), id = `focus-${now}`): FocusSession {
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) throw new Error('Choose a focus duration from 1 to 1,440 minutes.');
  return { id, startedAt: now, endsAt: now + minutes * 60_000, pausedAt: null, remainingOnPause: null, durationMinutes: minutes, appIds: [...new Set(appIds)], status: 'active' };
}

export function reconcileFocus(focus: FocusSession | null, now = Date.now()): FocusSession | null {
  if (focus?.status === 'active' && now >= focus.endsAt) return { ...focus, status: 'completed', pausedAt: null, remainingOnPause: null };
  return focus;
}

export function pauseFocus(focus: FocusSession | null, now = Date.now()): FocusSession | null {
  const current = reconcileFocus(focus, now);
  if (current?.status !== 'active') return current;
  return { ...current, status: 'paused', pausedAt: now, remainingOnPause: remainingFocusMilliseconds(current, now) };
}

export function resumeFocus(focus: FocusSession | null, now = Date.now()): FocusSession | null {
  if (focus?.status !== 'paused') return focus;
  if ((focus.remainingOnPause ?? 0) <= 0) return { ...focus, status: 'completed', pausedAt: null, remainingOnPause: null };
  return { ...focus, status: 'active', endsAt: now + (focus.remainingOnPause ?? 0), pausedAt: null, remainingOnPause: null };
}

export function cancelFocus(focus: FocusSession | null): FocusSession | null {
  if (!focus || focus.status === 'completed' || focus.status === 'cancelled') return focus;
  return { ...focus, status: 'cancelled', pausedAt: null, remainingOnPause: null };
}
