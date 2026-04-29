/**
 * Coding-CLI substate reducer tests.
 *
 * Same shape as use-streaming-turn.test.ts — pure-function folding of
 * typed bus events into the substate map.
 *
 * Run: bun test src/hooks/coding-cli-state.test.ts
 */
import { describe, expect, test } from 'bun:test';
import type { SSEEvent } from '@/lib/api-client';
import {
  isCodingCliEvent,
  reduceCodingCliSessions,
  type CodingCliSessionState,
} from './coding-cli-state';

let now = 1_700_000_000_000;

function ev(name: string, payload: Record<string, unknown> = {}): SSEEvent {
  now += 10;
  return { event: name, payload: { codingCliSessionId: 'sess-1', ...payload }, ts: now };
}

function fold(events: SSEEvent[]): Record<string, CodingCliSessionState> {
  return events.reduce<Record<string, CodingCliSessionState>>(
    (acc, e) => reduceCodingCliSessions(acc, e),
    {},
  );
}

const baseCreated = ev('coding-cli:session_created', {
  taskId: 't1',
  providerId: 'claude-code',
  state: 'created',
  capabilities: {
    headless: true,
    interactive: true,
    streamProtocol: true,
    resume: true,
    nativeHooks: true,
    jsonOutput: true,
    approvalPrompts: true,
    toolEvents: true,
    fileEditEvents: true,
    transcriptAccess: true,
    statusCommand: true,
    cancelSupport: true,
  },
  binaryPath: '/usr/bin/claude',
  binaryVersion: '2.1.0',
  cwd: '/tmp/work',
});

describe('isCodingCliEvent', () => {
  test('matches coding-cli prefix only', () => {
    expect(isCodingCliEvent('coding-cli:tool_started')).toBe(true);
    expect(isCodingCliEvent('agent:tool_started')).toBe(false);
    expect(isCodingCliEvent('task:start')).toBe(false);
  });
});

describe('reduceCodingCliSessions — bootstrap', () => {
  test('session_created creates a new entry', () => {
    const state = fold([baseCreated]);
    expect(state['sess-1']).toBeDefined();
    expect(state['sess-1']!.providerId).toBe('claude-code');
    expect(state['sess-1']!.binaryVersion).toBe('2.1.0');
  });

  test('events for unknown session_id are dropped', () => {
    const state = fold([
      ev('coding-cli:tool_started', { toolName: 'Edit' }),
    ]);
    expect(Object.keys(state)).toHaveLength(0);
  });

  test('events without codingCliSessionId are dropped', () => {
    const evNoId: SSEEvent = {
      event: 'coding-cli:tool_started',
      payload: { toolName: 'Edit' },
      ts: now,
    };
    const state = reduceCodingCliSessions({}, evNoId);
    expect(Object.keys(state)).toHaveLength(0);
  });
});

describe('reduceCodingCliSessions — activity', () => {
  test('tool_started + tool_completed pair into one entry', () => {
    const state = fold([
      baseCreated,
      ev('coding-cli:tool_started', { toolName: 'Edit', summary: 'src/foo.ts' }),
      ev('coding-cli:tool_completed', { toolName: 'Edit', ok: true, durationMs: 42 }),
    ]);
    const tools = state['sess-1']!.toolActivity;
    expect(tools).toHaveLength(1);
    expect(tools[0]!.status).toBe('success');
    expect(tools[0]!.durationMs).toBe(42);
  });

  test('output_delta accumulates within cap', () => {
    const state = fold([
      baseCreated,
      ev('coding-cli:output_delta', { text: 'hello ', channel: 'stdout' }),
      ev('coding-cli:output_delta', { text: 'world', channel: 'stdout' }),
    ]);
    expect(state['sess-1']!.outputBuffer).toBe('hello world');
  });

  test('file_changed dedupes', () => {
    const state = fold([
      baseCreated,
      ev('coding-cli:file_changed', { path: 'src/a.ts', changeType: 'modified' }),
      ev('coding-cli:file_changed', { path: 'src/a.ts', changeType: 'modified' }),
      ev('coding-cli:file_changed', { path: 'src/b.ts', changeType: 'created' }),
    ]);
    expect(state['sess-1']!.filesChanged).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

describe('reduceCodingCliSessions — approvals', () => {
  test('approval_required sets pendingApproval; resolved clears it', () => {
    const state = fold([
      baseCreated,
      ev('coding-cli:approval_required', {
        requestId: 'req-1',
        taskId: 't1',
        scope: 'shell',
        summary: 'rm -rf',
        detail: 'rm -rf /tmp/x',
        policyDecision: 'require-human',
        policyReason: 'destructive',
      }),
    ]);
    expect(state['sess-1']!.pendingApproval?.requestId).toBe('req-1');
    expect(state['sess-1']!.pendingApproval?.policyDecision).toBe('require-human');

    const after = reduceCodingCliSessions(
      state,
      ev('coding-cli:approval_resolved', {
        requestId: 'req-1',
        decision: 'rejected',
        decidedBy: 'human',
        decidedAt: now + 100,
      }),
    );
    expect(after['sess-1']!.pendingApproval).toBeUndefined();
    expect(after['sess-1']!.resolvedApprovals).toHaveLength(1);
    expect(after['sess-1']!.resolvedApprovals[0]!.decision).toBe('rejected');
  });
});

describe('reduceCodingCliSessions — terminal + verification', () => {
  test('result_reported + verification_completed → result + verification stored', () => {
    const claim = {
      status: 'completed',
      providerId: 'claude-code',
      summary: 'done',
      changedFiles: ['src/foo.ts'],
      commandsRun: [],
      testsRun: [],
      decisions: [],
      verification: { claimedPassed: true, details: '' },
      blockers: [],
      requiresHumanReview: false,
    };
    const state = fold([
      baseCreated,
      ev('coding-cli:result_reported', { claim }),
      ev('coding-cli:verification_completed', {
        passed: false,
        oracleVerdicts: [{ name: 'git-diff', ok: false, detail: 'phantom file' }],
        predictionError: { claimed: true, actual: false, reason: 'phantom file' },
      }),
      ev('coding-cli:failed', { reason: 'verification failed', state: 'failed' }),
    ]);
    expect(state['sess-1']!.result?.summary).toBe('done');
    expect(state['sess-1']!.verification?.passed).toBe(false);
    expect(state['sess-1']!.verification?.predictionError).toEqual({
      claimed: true,
      actual: false,
      reason: 'phantom file',
    });
    expect(state['sess-1']!.state).toBe('failed');
    expect(state['sess-1']!.failureReason).toBe('verification failed');
  });

  test('cancelled sets cancelled metadata', () => {
    const state = fold([
      baseCreated,
      ev('coding-cli:cancelled', { cancelledBy: 'user', reason: 'changed mind', state: 'cancelled' }),
    ]);
    expect(state['sess-1']!.cancelled?.by).toBe('user');
    expect(state['sess-1']!.cancelled?.reason).toBe('changed mind');
  });

  test('stalled sets stalled hint without becoming terminal', () => {
    const state = fold([
      baseCreated,
      ev('coding-cli:state_changed', { state: 'running' }),
      ev('coding-cli:stalled', { idleMs: 60_000, state: 'stalled' }),
    ]);
    expect(state['sess-1']!.stalled?.idleMs).toBe(60_000);
    expect(state['sess-1']!.state).toBe('stalled');
  });
});
