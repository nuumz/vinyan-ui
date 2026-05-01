/**
 * Process-state reconciliation triggers — pure tests.
 *
 * Pins the contract that the SSE wiring uses to decide whether to
 * invalidate the `['task-process-state', taskId]` React Query cache.
 * Adding or removing a trigger here (without doing the same in the
 * service's `PROJECTION_INTERPRETED_EVENTS`) creates drift; this test
 * is the local-side guard.
 */
import { describe, expect, test } from 'bun:test';
import {
  RECONCILE_TRIGGER_EVENT_TYPES,
  extractTaskIdFromPayload,
  isReconcileTriggerEvent,
} from './process-state-triggers';

describe('RECONCILE_TRIGGER_EVENT_TYPES', () => {
  test('contains terminal task-lifecycle events', () => {
    for (const ev of [
      'task:complete',
      'task:done',
      'task:failed',
      'task:escalate',
      'task:timeout',
      'task:cancelled',
    ]) {
      expect(RECONCILE_TRIGGER_EVENT_TYPES.has(ev)).toBe(true);
    }
  });

  test('contains workflow gate transitions', () => {
    for (const ev of [
      'workflow:plan_approved',
      'workflow:plan_rejected',
      'workflow:human_input_needed',
      'workflow:human_input_provided',
      'workflow:partial_failure_decision_needed',
      'workflow:partial_failure_decision_provided',
    ]) {
      expect(RECONCILE_TRIGGER_EVENT_TYPES.has(ev)).toBe(true);
    }
  });

  test('contains coding-cli gate + terminal events', () => {
    for (const ev of [
      'coding-cli:approval_required',
      'coding-cli:approval_resolved',
      'coding-cli:completed',
      'coding-cli:failed',
      'coding-cli:cancelled',
    ]) {
      expect(RECONCILE_TRIGGER_EVENT_TYPES.has(ev)).toBe(true);
    }
  });

  test('contains durable approval ledger events', () => {
    for (const ev of [
      'approval:ledger_pending',
      'approval:ledger_resolved',
      'approval:ledger_superseded',
    ]) {
      expect(RECONCILE_TRIGGER_EVENT_TYPES.has(ev)).toBe(true);
    }
  });

  test('does NOT contain pure stream-text events (would burn refetches)', () => {
    for (const ev of [
      'agent:thinking',
      'agent:text_delta',
      'phase:timing',
      'oracle:verdict',
      'agent:tool_executed',
      'agent:tool_started',
      'workflow:step_start',
      'workflow:step_complete',
      'workflow:subtask_updated',
      'workflow:todo_updated',
    ]) {
      expect(RECONCILE_TRIGGER_EVENT_TYPES.has(ev)).toBe(false);
    }
  });
});

describe('isReconcileTriggerEvent', () => {
  test('returns true for canonical trigger events regardless of payload', () => {
    expect(isReconcileTriggerEvent('task:complete', null)).toBe(true);
    expect(isReconcileTriggerEvent('task:complete', { taskId: 't' })).toBe(true);
    expect(isReconcileTriggerEvent('coding-cli:approval_required')).toBe(true);
  });

  test('returns false for non-trigger events', () => {
    expect(isReconcileTriggerEvent('agent:thinking')).toBe(false);
    expect(isReconcileTriggerEvent('agent:text_delta')).toBe(false);
    expect(isReconcileTriggerEvent('phase:timing')).toBe(false);
    expect(isReconcileTriggerEvent('workflow:step_start')).toBe(false);
  });

  test('workflow:plan_ready ONLY triggers when awaitingApproval === true', () => {
    expect(isReconcileTriggerEvent('workflow:plan_ready', { awaitingApproval: true })).toBe(true);
    expect(isReconcileTriggerEvent('workflow:plan_ready', { awaitingApproval: false })).toBe(false);
    expect(isReconcileTriggerEvent('workflow:plan_ready', {})).toBe(false);
    expect(isReconcileTriggerEvent('workflow:plan_ready', null)).toBe(false);
    expect(isReconcileTriggerEvent('workflow:plan_ready', undefined)).toBe(false);
  });
});

describe('extractTaskIdFromPayload', () => {
  test('returns the string taskId when present', () => {
    expect(extractTaskIdFromPayload({ taskId: 'abc' })).toBe('abc');
    expect(extractTaskIdFromPayload({ taskId: 'abc', other: 'x' })).toBe('abc');
  });

  test('returns undefined for missing or non-string taskId', () => {
    expect(extractTaskIdFromPayload(null)).toBeUndefined();
    expect(extractTaskIdFromPayload(undefined)).toBeUndefined();
    expect(extractTaskIdFromPayload({})).toBeUndefined();
    expect(extractTaskIdFromPayload({ taskId: 42 })).toBeUndefined();
    expect(extractTaskIdFromPayload({ taskId: '' })).toBeUndefined();
    expect(extractTaskIdFromPayload('not-an-object')).toBeUndefined();
  });
});

describe('RECONCILE_TRIGGER_EVENT_TYPES sanity', () => {
  test('has no duplicates', () => {
    const arr = [...RECONCILE_TRIGGER_EVENT_TYPES];
    expect(new Set(arr).size).toBe(arr.length);
  });
});
