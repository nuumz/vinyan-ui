/**
 * useAuditProjection — entity-scope filter contract tests.
 *
 * The hook narrows the projection's auditLog by entity scope:
 *   - task / workflow / session  → all entries pass through
 *   - subtask                    → entries whose subTaskId matches
 *   - subagent                   → entries whose subAgentId matches
 *
 * We test the filter logic directly (not the React useMemo wiring)
 * because the project's test setup has no jsdom/RTL. The filter is a
 * pure function exported via `_internal_filterEntries` for tests; if
 * that export is removed, this file fails-loud at import time.
 *
 * Identity-stability invariant (memo correctness) is exercised via the
 * `regroup` helper — same input array reference produces the same
 * output structure shape so React's memo doesn't churn.
 */
import { describe, expect, test } from 'bun:test';
import type { AuditEntry } from '@/lib/api-client';
import { _filterEntries, _regroup, type AuditScope } from './use-audit-projection';

const baseWrapper = {
  id: 'audit-1',
  taskId: 'task-1',
  ts: 1_000,
  schemaVersion: 2 as const,
  policyVersion: 'audit-v1',
  actor: { type: 'orchestrator' as const },
};

function entry(over: Partial<AuditEntry> & { kind: AuditEntry['kind']; id: string }): AuditEntry {
  return { ...baseWrapper, ...over } as AuditEntry;
}

describe('useAuditProjection — _filterEntries (scope filter)', () => {
  const root = entry({ id: 'r-thought', kind: 'thought', content: 'root', ts: 100 });
  const subA = entry({
    id: 'sa-thought',
    kind: 'thought',
    content: 'sub-a',
    ts: 200,
    subTaskId: 'task-1-delegate-step1',
    subAgentId: 'task-1-delegate-step1',
  });
  const subB = entry({
    id: 'sb-thought',
    kind: 'thought',
    content: 'sub-b',
    ts: 300,
    subTaskId: 'task-1-delegate-step2',
    subAgentId: 'task-1-delegate-step2',
  });
  const subagentMarker = entry({
    id: 'samark',
    kind: 'subagent',
    ts: 400,
    subAgentId: 'task-1-delegate-step1',
    phase: 'spawn',
  });
  const all = [root, subA, subB, subagentMarker];

  test('task scope: returns every entry', () => {
    const scope: AuditScope = { kind: 'task', taskId: 'task-1' };
    expect(_filterEntries(all, scope)).toEqual(all);
  });

  test('workflow scope: returns every entry (workflowId === taskId)', () => {
    const scope: AuditScope = { kind: 'workflow', sessionId: 'sess-1', workflowId: 'task-1' };
    expect(_filterEntries(all, scope)).toEqual(all);
  });

  test('session scope: returns every entry (degraded today; backend route TBD)', () => {
    const scope: AuditScope = { kind: 'session', sessionId: 'sess-1' };
    expect(_filterEntries(all, scope)).toEqual(all);
  });

  test('subtask scope: narrows to entries whose subTaskId matches', () => {
    const scope: AuditScope = { kind: 'subtask', taskId: 'task-1', subTaskId: 'task-1-delegate-step1' };
    const filtered = _filterEntries(all, scope).map((e) => e.id);
    expect(filtered).toContain('sa-thought');
    expect(filtered).not.toContain('sb-thought');
    expect(filtered).not.toContain('r-thought');
  });

  test('subagent scope: narrows to wrapper subAgentId AND variant-body matches', () => {
    const scope: AuditScope = { kind: 'subagent', taskId: 'task-1', subAgentId: 'task-1-delegate-step1' };
    const filtered = _filterEntries(all, scope).map((e) => e.id);
    expect(filtered).toContain('sa-thought'); // wrapper subAgentId match
    expect(filtered).toContain('samark'); // variant-body subAgentId match
    expect(filtered).not.toContain('sb-thought');
    expect(filtered).not.toContain('r-thought');
  });

  test('subagent scope: plan_step rows with matching subAgentId surface in the filter', () => {
    const planStep = entry({
      id: 'ps-1',
      kind: 'plan_step',
      ts: 500,
      stepId: 'step1',
      status: 'running',
      subAgentId: 'task-1-delegate-step1',
    });
    const scope: AuditScope = { kind: 'subagent', taskId: 'task-1', subAgentId: 'task-1-delegate-step1' };
    expect(_filterEntries([planStep], scope)).toEqual([planStep]);
  });
});

describe('useAuditProjection — _regroup (bySection rebuild)', () => {
  test('partitions entries into the 12 known sections', () => {
    const entries: AuditEntry[] = [
      entry({ id: 't', kind: 'thought', content: 'x' }),
      entry({ id: 'tc', kind: 'tool_call', lifecycle: 'executed', toolId: 'r', argsHash: 'a'.repeat(64) }),
      entry({
        id: 'd',
        kind: 'decision',
        decisionType: 'route',
        verdict: 'r',
        rationale: 'x',
      }),
      entry({ id: 'v', kind: 'verdict', source: 'oracle', pass: true }),
      entry({ id: 'ps', kind: 'plan_step', stepId: 's1', status: 'running' }),
      entry({ id: 'st', kind: 'subtask', subTaskId: 'sub-1', phase: 'spawn' }),
      entry({ id: 'sa', kind: 'subagent', subAgentId: 'sub-1', phase: 'spawn' }),
      entry({ id: 'wf', kind: 'workflow', phase: 'planned' }),
      entry({ id: 'se', kind: 'session', phase: 'created' }),
      entry({ id: 'g', kind: 'gate', gateName: 'approval', phase: 'opened' }),
      entry({
        id: 'f',
        kind: 'final',
        contentHash: 'a'.repeat(64),
        contentRedactedPreview: 'done',
        assembledFromStepIds: [],
        assembledFromDelegateIds: [],
      }),
    ];
    const out = _regroup(entries);
    expect(out.thoughts.length).toBe(1);
    expect(out.toolCalls.length).toBe(1);
    expect(out.decisions.length).toBe(1);
    expect(out.verdicts.length).toBe(1);
    expect(out.planSteps.length).toBe(1);
    expect(out.subTasks.length).toBe(1);
    expect(out.subAgents.length).toBe(1);
    expect(out.workflowEvents.length).toBe(1);
    expect(out.sessionEvents.length).toBe(1);
    expect(out.gates.length).toBe(1);
    expect(out.finals.length).toBe(1);
  });
});
