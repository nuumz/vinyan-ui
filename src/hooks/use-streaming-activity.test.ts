/**
 * Unit tests for the streaming-caret transition function. The React hook
 * itself wraps `setTimeout` + `setState` and is exercised end-to-end via
 * the live bubble; the pure transition function is what carries the
 * stream-vs-idle / terminal-status / shrink-on-settle rules.
 */
import { describe, expect, test } from 'bun:test';
import {
  evaluateStreamingActivity,
  initialStreamingActivity,
  type StreamingActivitySnapshot,
} from './use-streaming-activity';

describe('evaluateStreamingActivity', () => {
  test('content delta during running flips active=true and emits activate', () => {
    const r = evaluateStreamingActivity(
      { active: false, prevLen: 5 },
      'hello world',
      'running',
    );
    expect(r.snapshot.active).toBe(true);
    expect(r.snapshot.prevLen).toBe('hello world'.length);
    expect(r.action).toBe('activate');
  });

  test('repeated content delta keeps emitting activate so the idle timer can refresh', () => {
    let snap: StreamingActivitySnapshot = initialStreamingActivity;
    const r1 = evaluateStreamingActivity(snap, 'h', 'running');
    snap = r1.snapshot;
    expect(r1.action).toBe('activate');

    const r2 = evaluateStreamingActivity(snap, 'he', 'running');
    expect(r2.action).toBe('activate');
    expect(r2.snapshot.prevLen).toBe(2);
  });

  test('no length change emits none even if status is still running', () => {
    const r = evaluateStreamingActivity(
      { active: true, prevLen: 5 },
      'hello',
      'running',
    );
    expect(r.action).toBe('none');
    expect(r.snapshot).toEqual({ active: true, prevLen: 5 });
  });

  test('terminal status flips active=false and emits deactivate when previously active', () => {
    const r = evaluateStreamingActivity(
      { active: true, prevLen: 100 },
      'hello',
      'done',
    );
    expect(r.snapshot.active).toBe(false);
    expect(r.snapshot.prevLen).toBe('hello'.length);
    expect(r.action).toBe('deactivate');
  });

  test('terminal status from inactive state emits none — no flicker', () => {
    const r = evaluateStreamingActivity(
      { active: false, prevLen: 0 },
      '',
      'done',
    );
    expect(r.action).toBe('none');
    expect(r.snapshot.active).toBe(false);
  });

  test('error status behaves like done — caret stops', () => {
    const r = evaluateStreamingActivity(
      { active: true, prevLen: 50 },
      'partial',
      'error',
    );
    expect(r.action).toBe('deactivate');
    expect(r.snapshot.active).toBe(false);
  });

  test('awaiting-human-input gate stops the caret', () => {
    const r = evaluateStreamingActivity(
      { active: true, prevLen: 30 },
      'mid sentence…',
      'awaiting-human-input',
    );
    expect(r.action).toBe('deactivate');
    expect(r.snapshot.active).toBe(false);
  });

  test('content shrink (task:complete overwrite) resets baseline without raising caret', () => {
    // The reducer can replace `finalContent` with the canonical
    // `result.content` on `task:complete`, which can be SHORTER than what
    // was streamed. Treat as baseline reset, not as activity.
    const r = evaluateStreamingActivity(
      { active: false, prevLen: 200 },
      'short final',
      'running',
    );
    expect(r.action).toBe('none');
    expect(r.snapshot.active).toBe(false);
    expect(r.snapshot.prevLen).toBe('short final'.length);
  });

  test('content shrink while active keeps the caret active until the next terminal/idle', () => {
    // We don't want the caret to flash off mid-stream just because the
    // reducer briefly rewrote a buffer; the idle timer in the hook is
    // the canonical way to fade the caret.
    const r = evaluateStreamingActivity(
      { active: true, prevLen: 200 },
      'short',
      'running',
    );
    expect(r.action).toBe('none');
    expect(r.snapshot.active).toBe(true);
    expect(r.snapshot.prevLen).toBe('short'.length);
  });

  test('idle status (initial) emits none — caret stays off', () => {
    const r = evaluateStreamingActivity(initialStreamingActivity, '', 'idle');
    expect(r.action).toBe('none');
    expect(r.snapshot.active).toBe(false);
  });
});
