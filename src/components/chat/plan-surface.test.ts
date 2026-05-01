/**
 * Unit tests for the pure helpers exported from `plan-surface.tsx`.
 * Vinyan-ui has no React testing library, so DOM-level checks aren't
 * possible — the strategy across this codebase is to extract pure
 * functions and lock their behaviour in fast unit tests (matches the
 * `evaluateStreamingActivity` pattern used by the streaming-caret hook).
 */
import { describe, expect, test } from 'bun:test';
import { formatDuration } from './plan-surface';

describe('formatDuration', () => {
  test('renders sub-second values as plain ms', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  test('renders 1s–60s with one decimal', () => {
    expect(formatDuration(2400)).toBe('2.4s');
    expect(formatDuration(14_900)).toBe('14.9s');
  });

  test('renders >=60s as `Nm Ks`', () => {
    expect(formatDuration(83_000)).toBe('1m 23s');
    expect(formatDuration(193_000)).toBe('3m 13s');
  });

  test('clamps negative input to 0ms (defends against inverted timestamps)', () => {
    // Concrete repro from session
    // d4aa26fa-73f1-4ad5-8b16-8727c15ee421: a stale plan_update locked
    // startedAt past finishedAt, producing a literal `-42854ms` in the
    // plan checklist. The reducer now enforces the invariant at write
    // time, but legacy persisted rows can still flow a negative number
    // through here — render `0ms`, never the raw negative.
    expect(formatDuration(-42_854)).toBe('0ms');
    expect(formatDuration(-1)).toBe('0ms');
  });

  test('clamps NaN / Infinity to 0ms', () => {
    expect(formatDuration(Number.NaN)).toBe('0ms');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0ms');
    expect(formatDuration(Number.NEGATIVE_INFINITY)).toBe('0ms');
  });
});
