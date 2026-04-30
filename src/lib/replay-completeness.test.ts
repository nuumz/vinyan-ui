/**
 * Replay-completeness classifier tests. Pure function, easy to unit-cover —
 * one test per kind plus a normalizer no-op assertion.
 */
import { describe, expect, test } from 'bun:test';
import { normalizeReplayedTurnForDisplay, replayCompleteness } from './replay-completeness';

function mkEvent(eventType: string, payload?: Record<string, unknown>) {
  return { eventType, payload, ts: Date.now() };
}

describe('replayCompleteness', () => {
  test('returns unsupported when caller flags it', () => {
    const r = replayCompleteness([], { unsupported: true });
    expect(r.kind).toBe('unsupported');
  });

  test('returns error when caller flags it', () => {
    const r = replayCompleteness([], { error: true });
    expect(r.kind).toBe('error');
  });

  test('returns empty for an empty log', () => {
    expect(replayCompleteness([]).kind).toBe('empty');
  });

  test('task:complete → complete', () => {
    const r = replayCompleteness([
      mkEvent('task:start'),
      mkEvent('phase:timing'),
      mkEvent('task:complete'),
    ]);
    expect(r.kind).toBe('complete');
    expect(r.terminalEventType).toBe('task:complete');
    expect(r.eventCount).toBe(3);
  });

  test('task:timeout → terminal-error', () => {
    const r = replayCompleteness([mkEvent('task:start'), mkEvent('task:timeout')]);
    expect(r.kind).toBe('terminal-error');
    expect(r.terminalEventType).toBe('task:timeout');
  });

  test('worker:error → terminal-error', () => {
    const r = replayCompleteness([mkEvent('task:start'), mkEvent('worker:error')]);
    expect(r.kind).toBe('terminal-error');
    expect(r.terminalEventType).toBe('worker:error');
  });

  test('mid-run with no terminal → missing-terminal', () => {
    const r = replayCompleteness([
      mkEvent('task:start'),
      mkEvent('agent:plan_update'),
      mkEvent('workflow:step_start'),
    ]);
    expect(r.kind).toBe('missing-terminal');
  });

  test('plan_ready awaitingApproval=true with no resolution → awaiting-user', () => {
    const r = replayCompleteness([
      mkEvent('task:start'),
      mkEvent('workflow:plan_ready', { awaitingApproval: true }),
    ]);
    expect(r.kind).toBe('awaiting-user');
  });

  test('plan_ready without awaitingApproval is NOT a gate → missing-terminal', () => {
    const r = replayCompleteness([
      mkEvent('task:start'),
      mkEvent('workflow:plan_ready', { awaitingApproval: false }),
    ]);
    expect(r.kind).toBe('missing-terminal');
  });

  test('opened gate then closed → not awaiting-user', () => {
    const r = replayCompleteness([
      mkEvent('task:start'),
      mkEvent('workflow:plan_ready', { awaitingApproval: true }),
      mkEvent('workflow:plan_approved'),
    ]);
    expect(r.kind).toBe('missing-terminal');
  });

  test('opened gate then closed then task:complete → complete', () => {
    const r = replayCompleteness([
      mkEvent('task:start'),
      mkEvent('workflow:plan_ready', { awaitingApproval: true }),
      mkEvent('workflow:plan_approved'),
      mkEvent('task:complete'),
    ]);
    expect(r.kind).toBe('complete');
  });

  test('human_input_needed without provided → awaiting-user', () => {
    const r = replayCompleteness([
      mkEvent('task:start'),
      mkEvent('workflow:human_input_needed'),
    ]);
    expect(r.kind).toBe('awaiting-user');
  });
});

describe('normalizeReplayedTurnForDisplay', () => {
  test('returns the turn unchanged — does NOT force running→done', () => {
    const turn = {
      status: 'running',
      planSteps: [
        { id: 's1', label: 'A', status: 'running' as const, toolCallIds: [] },
        { id: 's2', label: 'B', status: 'pending' as const, toolCallIds: [] },
      ],
    };
    const completeness = replayCompleteness([{ eventType: 'task:start', ts: 1 }]);
    const out = normalizeReplayedTurnForDisplay(turn, completeness);
    expect(out).toBe(turn);
    expect(out.status).toBe('running');
    expect(out.planSteps[0]!.status).toBe('running');
    expect(out.planSteps[1]!.status).toBe('pending');
  });
});
