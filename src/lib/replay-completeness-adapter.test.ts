/**
 * `selectAuthoritativeCompleteness` — pure projection-priority test.
 *
 * Pins the contract that the backend projection's completeness wins
 * over the local `replayCompleteness` classifier. The probe uses
 * deliberately-invalid local fallback inputs alongside a valid
 * projection: if the test ever fails because the result depended on
 * the local events, the projection-priority invariant is broken.
 */
import { describe, expect, test } from 'bun:test';
import type { TaskProcessProjection } from '@/lib/api-client';
import {
  fromBackendCompleteness,
  selectAuthoritativeCompleteness,
} from './replay-completeness';

function projection(over: Partial<TaskProcessProjection> = {}): TaskProcessProjection {
  return {
    lifecycle: { taskId: 't', status: 'completed', terminalEventType: 'task:complete', ...over.lifecycle },
    completeness: { kind: 'complete', eventCount: 7, truncated: false, ...over.completeness },
    gates: {
      approval: { open: false, resolved: false },
      workflowHumanInput: { open: false, resolved: false },
      partialDecision: { open: false, resolved: false },
      codingCliApproval: { open: false, resolved: false },
      ...over.gates,
    },
    plan: { todoList: [], steps: [], multiAgentSubtasks: [], ...over.plan },
    codingCliSessions: over.codingCliSessions ?? [],
    diagnostics: { phases: [], toolCalls: [], oracleVerdicts: [], escalations: [], ...over.diagnostics },
    history: { lastSeq: 0, eventCount: 0, truncated: false, descendantTaskIds: [], ...over.history },
  };
}

describe('selectAuthoritativeCompleteness — backend wins', () => {
  test('returns backend completeness when projection is present', () => {
    const result = selectAuthoritativeCompleteness(
      projection({
        lifecycle: { taskId: 't', status: 'completed', terminalEventType: 'task:complete' },
        completeness: { kind: 'complete', eventCount: 42, truncated: false },
      }),
      // Deliberately-corrupt fallback: if the function ever consults
      // these inputs while a projection is present, the result will
      // diverge from the assertion below and the test fails.
      { events: [], unsupported: true, error: true },
    );
    expect(result.kind).toBe('complete');
    expect(result.eventCount).toBe(42);
    expect(result.terminalEventType).toBe('task:complete');
  });

  test('backend completeness "awaiting-user" surfaces over local error fallback', () => {
    const result = selectAuthoritativeCompleteness(
      projection({ completeness: { kind: 'awaiting-user', eventCount: 3, truncated: false } }),
      { events: [], unsupported: false, error: true },
    );
    expect(result.kind).toBe('awaiting-user');
  });

  test('backend completeness "terminal-error" surfaces over local missing-terminal heuristic', () => {
    const result = selectAuthoritativeCompleteness(
      projection({ completeness: { kind: 'terminal-error', eventCount: 5, truncated: false } }),
      { events: [{ eventType: 'agent:thinking', ts: 1 }], unsupported: false, error: false },
    );
    expect(result.kind).toBe('terminal-error');
  });
});

describe('selectAuthoritativeCompleteness — fallback path', () => {
  test('returns local complete when projection is null', () => {
    const result = selectAuthoritativeCompleteness(null, {
      events: [
        { eventType: 'task:start', ts: 1 },
        { eventType: 'task:complete', ts: 2 },
      ],
      unsupported: false,
      error: false,
    });
    expect(result.kind).toBe('complete');
  });

  test('returns local unsupported when projection is undefined and unsupported flag set', () => {
    const result = selectAuthoritativeCompleteness(undefined, {
      events: [],
      unsupported: true,
      error: false,
    });
    expect(result.kind).toBe('unsupported');
  });

  test('returns local error when projection is missing and the fallback says error', () => {
    const result = selectAuthoritativeCompleteness(null, {
      events: [],
      unsupported: false,
      error: true,
    });
    expect(result.kind).toBe('error');
  });

  test('returns local empty when projection missing and events empty', () => {
    const result = selectAuthoritativeCompleteness(null, {
      events: [],
      unsupported: false,
      error: false,
    });
    expect(result.kind).toBe('empty');
  });
});

describe('fromBackendCompleteness', () => {
  test('preserves kind, eventCount, timestamps, and the optional terminal event', () => {
    const out = fromBackendCompleteness(
      { kind: 'complete', eventCount: 9, firstTs: 100, lastTs: 200, truncated: false },
      'task:complete',
    );
    expect(out.kind).toBe('complete');
    expect(out.eventCount).toBe(9);
    expect(out.firstTs).toBe(100);
    expect(out.lastTs).toBe(200);
    expect(out.terminalEventType).toBe('task:complete');
  });

  test('omits terminalEventType when not provided', () => {
    const out = fromBackendCompleteness({ kind: 'awaiting-user', eventCount: 2, truncated: false });
    expect(out.terminalEventType).toBeUndefined();
  });
});
