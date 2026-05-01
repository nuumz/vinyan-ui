/**
 * Coding-CLI session merger — pure tests.
 *
 * Pins the contract that backend projection wins on lifecycle authority
 * fields and the local SSE fold keeps live-text accumulators.
 */
import { describe, expect, test } from 'bun:test';
import type { CodingCliSessionState } from '@/hooks/coding-cli-state';
import type { TaskProcessCodingCliSession } from '@/lib/api-client';
import { coerceBackendCodingCliSession, mergeCodingCliSessions } from './coding-cli-projection';

function localSession(over: Partial<CodingCliSessionState> = {}): CodingCliSessionState {
  return {
    id: over.id ?? 'cli-1',
    taskId: over.taskId ?? 'task-1',
    providerId: over.providerId ?? 'claude-code',
    state: over.state ?? 'running',
    capabilities: {} as CodingCliSessionState['capabilities'],
    binaryPath: '/usr/local/bin/claude',
    binaryVersion: null,
    cwd: '/tmp',
    pid: null,
    createdAt: over.createdAt ?? 1000,
    outputBuffer: over.outputBuffer ?? '',
    toolActivity: over.toolActivity ?? [],
    filesChanged: over.filesChanged ?? [],
    commandsRequested: over.commandsRequested ?? [],
    decisions: over.decisions ?? [],
    checkpoints: over.checkpoints ?? [],
    resolvedApprovals: over.resolvedApprovals ?? [],
    ...(over.startedAt !== undefined ? { startedAt: over.startedAt } : {}),
    ...(over.endedAt !== undefined ? { endedAt: over.endedAt } : {}),
    ...(over.pendingApproval ? { pendingApproval: over.pendingApproval } : {}),
    ...(over.failureReason !== undefined ? { failureReason: over.failureReason } : {}),
    ...(over.cancelled ? { cancelled: over.cancelled } : {}),
    ...(over.stalled ? { stalled: over.stalled } : {}),
  };
}

function backendSession(over: Partial<TaskProcessCodingCliSession> = {}): TaskProcessCodingCliSession {
  return {
    id: over.id ?? 'cli-1',
    taskId: over.taskId ?? 'task-1',
    providerId: over.providerId ?? 'claude-code',
    state: over.state ?? 'completed',
    startedAt: over.startedAt ?? 1000,
    updatedAt: over.updatedAt ?? 2000,
    ...(over.endedAt !== undefined ? { endedAt: over.endedAt } : {}),
    filesChanged: over.filesChanged ?? [],
    commandsRequested: over.commandsRequested ?? [],
    pendingApprovals: over.pendingApprovals ?? [],
    resolvedApprovals: over.resolvedApprovals ?? [],
    ...(over.finalResult !== undefined ? { finalResult: over.finalResult } : {}),
    ...(over.failureDetail ? { failureDetail: over.failureDetail } : {}),
    ...(over.cancelDetail ? { cancelDetail: over.cancelDetail } : {}),
    ...(over.stalledDetail ? { stalledDetail: over.stalledDetail } : {}),
  };
}

describe('mergeCodingCliSessions — backend wins on lifecycle authority', () => {
  test('backend state overrides local state', () => {
    const local = { 'cli-1': localSession({ state: 'running' }) };
    const backend = [backendSession({ id: 'cli-1', state: 'completed' })];
    const merged = mergeCodingCliSessions(local, backend);
    expect(merged['cli-1']?.state).toBe('completed');
  });

  test('backend endedAt overrides local (terminal lifecycle wins)', () => {
    const local = { 'cli-1': localSession({ state: 'running' }) };
    const backend = [backendSession({ id: 'cli-1', state: 'completed', endedAt: 9999 })];
    const merged = mergeCodingCliSessions(local, backend);
    expect(merged['cli-1']?.endedAt).toBe(9999);
  });

  test('backend filesChanged replaces local (durable list wins)', () => {
    const local = { 'cli-1': localSession({ filesChanged: ['src/old.ts'] }) };
    const backend = [backendSession({ id: 'cli-1', filesChanged: ['src/a.ts', 'src/b.ts'] })];
    const merged = mergeCodingCliSessions(local, backend);
    expect(merged['cli-1']?.filesChanged).toEqual(['src/a.ts', 'src/b.ts']);
  });

  test('backend pendingApprovals[0] becomes the single pendingApproval', () => {
    const local = { 'cli-1': localSession() };
    const backend = [
      backendSession({
        id: 'cli-1',
        pendingApprovals: [
          {
            requestId: 'req-1',
            command: 'rm -rf /',
            reason: 'destructive',
            policyDecision: 'require-human',
            requestedAt: 1500,
          },
        ],
      }),
    ];
    const merged = mergeCodingCliSessions(local, backend);
    expect(merged['cli-1']?.pendingApproval?.requestId).toBe('req-1');
    expect(merged['cli-1']?.pendingApproval?.summary).toBe('rm -rf /');
  });

  test('absent backend pending drops local optimistic pendingApproval (race fix)', () => {
    const local = {
      'cli-1': localSession({
        pendingApproval: {
          requestId: 'stale',
          taskId: 'task-1',
          scope: 'tool',
          summary: 'stale prompt',
          detail: '',
          policyDecision: 'require-human',
          policyReason: '',
          at: 100,
        },
      }),
    };
    const backend = [backendSession({ id: 'cli-1', pendingApprovals: [] })];
    const merged = mergeCodingCliSessions(local, backend);
    expect(merged['cli-1']?.pendingApproval).toBeUndefined();
  });

  test('backend resolvedApprovals replace local (full history from backend)', () => {
    const local = { 'cli-1': localSession() };
    const backend = [
      backendSession({
        id: 'cli-1',
        resolvedApprovals: [
          {
            requestId: 'r1',
            command: 'cmd-1',
            policyDecision: 'require-human',
            humanDecision: 'approved',
            decidedBy: 'alice',
            decidedAt: 200,
            requestedAt: 100,
          },
          {
            requestId: 'r2',
            command: 'cmd-2',
            policyDecision: 'require-human',
            humanDecision: 'rejected',
            decidedBy: 'bob',
            decidedAt: 250,
            requestedAt: 150,
          },
        ],
      }),
    ];
    const merged = mergeCodingCliSessions(local, backend);
    expect(merged['cli-1']?.resolvedApprovals).toHaveLength(2);
    expect(merged['cli-1']?.resolvedApprovals[0]?.decision).toBe('approved');
    expect(merged['cli-1']?.resolvedApprovals[1]?.decision).toBe('rejected');
  });
});

describe('mergeCodingCliSessions — backend wins on terminal context', () => {
  test('backend failureDetail.reason replaces local failureReason', () => {
    const local = {
      'cli-1': localSession({ state: 'failed', failureReason: 'stale local reason' }),
    };
    const backend = [
      backendSession({
        id: 'cli-1',
        state: 'failed',
        failureDetail: { reason: 'provider quota exhausted', at: 5000 },
      }),
    ];
    const merged = mergeCodingCliSessions(local, backend);
    expect(merged['cli-1']?.failureReason).toBe('provider quota exhausted');
  });

  test('backend cancelDetail replaces local cancelled metadata', () => {
    const local = {
      'cli-1': localSession({
        state: 'cancelled',
        cancelled: { by: 'stale-actor', at: 100 },
      }),
    };
    const backend = [
      backendSession({
        id: 'cli-1',
        state: 'cancelled',
        cancelDetail: { by: 'alice', reason: 'budget exceeded', at: 6000 },
      }),
    ];
    const merged = mergeCodingCliSessions(local, backend);
    expect(merged['cli-1']?.cancelled?.by).toBe('alice');
    expect(merged['cli-1']?.cancelled?.reason).toBe('budget exceeded');
    expect(merged['cli-1']?.cancelled?.at).toBe(6000);
  });

  test('backend stalledDetail replaces local stalled hint', () => {
    const local = {
      'cli-1': localSession({ stalled: { idleMs: 1000, at: 100 } }),
    };
    const backend = [
      backendSession({
        id: 'cli-1',
        state: 'running',
        stalledDetail: { idleMs: 92_000, at: 7500 },
      }),
    ];
    const merged = mergeCodingCliSessions(local, backend);
    expect(merged['cli-1']?.stalled?.idleMs).toBe(92_000);
    expect(merged['cli-1']?.stalled?.at).toBe(7500);
  });

  test('absent backend terminal context preserves local fallback (transition window)', () => {
    const local = {
      'cli-1': localSession({
        state: 'failed',
        failureReason: 'live SSE-derived reason',
        cancelled: { by: 'live', at: 100 },
        stalled: { idleMs: 30_000, at: 200 },
      }),
    };
    const backend = [
      backendSession({
        id: 'cli-1',
        state: 'failed',
        // No failureDetail / cancelDetail / stalledDetail — projection
        // hasn't yet picked up the corresponding events.
      }),
    ];
    const merged = mergeCodingCliSessions(local, backend);
    expect(merged['cli-1']?.failureReason).toBe('live SSE-derived reason');
    expect(merged['cli-1']?.cancelled?.by).toBe('live');
    expect(merged['cli-1']?.stalled?.idleMs).toBe(30_000);
  });
});

describe('mergeCodingCliSessions — local wins on transient UX', () => {
  test('local outputBuffer is preserved (backend does not carry it)', () => {
    const local = { 'cli-1': localSession({ outputBuffer: 'live stream text...' }) };
    const backend = [backendSession({ id: 'cli-1' })];
    const merged = mergeCodingCliSessions(local, backend);
    expect(merged['cli-1']?.outputBuffer).toBe('live stream text...');
  });

  test('local toolActivity is preserved', () => {
    const local = {
      'cli-1': localSession({
        toolActivity: [
          { id: 'tool-1', toolName: 'edit_file', status: 'running', at: 100 },
        ],
      }),
    };
    const backend = [backendSession({ id: 'cli-1' })];
    const merged = mergeCodingCliSessions(local, backend);
    expect(merged['cli-1']?.toolActivity).toHaveLength(1);
    expect(merged['cli-1']?.toolActivity[0]?.toolName).toBe('edit_file');
  });
});

describe('mergeCodingCliSessions — partial coverage', () => {
  test('session present only locally (live SSE before projection caught up) returns unchanged', () => {
    const local = { 'cli-only-local': localSession({ id: 'cli-only-local', state: 'running' }) };
    const merged = mergeCodingCliSessions(local, []);
    expect(merged['cli-only-local']?.state).toBe('running');
  });

  test('session present only in backend is coerced into local shape', () => {
    const backend = [
      backendSession({
        id: 'cli-historical',
        taskId: 'task-1',
        state: 'completed',
        filesChanged: ['src/x.ts'],
      }),
    ];
    const merged = mergeCodingCliSessions({}, backend);
    expect(merged['cli-historical']).toBeDefined();
    expect(merged['cli-historical']?.state).toBe('completed');
    expect(merged['cli-historical']?.filesChanged).toEqual(['src/x.ts']);
    // Defaults for local-only fields.
    expect(merged['cli-historical']?.outputBuffer).toBe('');
    expect(merged['cli-historical']?.toolActivity).toEqual([]);
  });

  test('empty backend returns local unchanged', () => {
    const local = { 'cli-1': localSession({ state: 'running' }) };
    const merged = mergeCodingCliSessions(local, []);
    expect(merged['cli-1']?.state).toBe('running');
  });
});

describe('coerceBackendCodingCliSession', () => {
  test('produces a CodingCliSessionState from backend shape', () => {
    const out = coerceBackendCodingCliSession(
      backendSession({
        id: 'cli-X',
        taskId: 'task-X',
        state: 'failed',
        filesChanged: ['a', 'b'],
        commandsRequested: ['ls'],
      }),
    );
    expect(out.id).toBe('cli-X');
    expect(out.taskId).toBe('task-X');
    expect(out.state).toBe('failed');
    expect(out.filesChanged).toEqual(['a', 'b']);
    expect(out.commandsRequested).toEqual(['ls']);
    expect(out.outputBuffer).toBe('');
  });
});
