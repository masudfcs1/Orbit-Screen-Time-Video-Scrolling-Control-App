import { describe, expect, it } from 'vitest';
import { cancelFocus, createFocus, pauseFocus, reconcileFocus, remainingFocusMilliseconds, resumeFocus } from '../src/domain/countdown';

describe('persisted countdown lifecycle', () => {
  it('derives remaining time from a persisted deadline after a restart', () => {
    const focus = createFocus(25, ['youtube'], 1000);
    const restored = JSON.parse(JSON.stringify(focus));
    expect(remainingFocusMilliseconds(restored, 61_000)).toBe(24 * 60_000);
    expect(reconcileFocus(restored, focus.endsAt)?.status).toBe('completed');
    expect(remainingFocusMilliseconds(restored, focus.endsAt + 5000)).toBe(0);
  });

  it('preserves paused remaining time and creates a new deadline on resume', () => {
    const focus = createFocus(10, ['youtube'], 1000);
    const paused = pauseFocus(focus, 61_000);
    expect(paused?.status).toBe('paused');
    expect(remainingFocusMilliseconds(paused, 9_000_000)).toBe(9 * 60_000);
    const resumed = resumeFocus(paused, 121_000);
    expect(resumed?.endsAt).toBe(661_000);
    expect(resumed?.pausedAt).toBeNull();
    expect(cancelFocus(resumed)?.status).toBe('cancelled');
  });

  it('cannot pause or revive an expired countdown', () => {
    const focus = createFocus(1, [], 0);
    expect(pauseFocus(focus, 60_000)?.status).toBe('completed');
    expect(resumeFocus(reconcileFocus(focus, 60_000), 65_000)?.status).toBe('completed');
    expect(() => createFocus(0, [], 0)).toThrow();
  });
});
