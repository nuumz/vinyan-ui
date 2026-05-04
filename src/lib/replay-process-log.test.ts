/**
 * replayProcessLog — descendant event routing for historical Process
 * Replay. The reducer's behaviour is tested in
 * `use-streaming-turn.test.ts`; this file pins the contract that
 * `replayProcessLog` correctly threads the backend's `scope` annotation
 * (and computes a sane fallback when missing) so the reducer can drop
 * parent-lifecycle events that originated under a sub-task.
 *
 * Concrete repro: without scope guarding, a child's `task:complete`
 * rebinds `turn.taskId` to the child id and every subsequent
 * `agent:tool_started` from another delegate fails the
 * `eventTaskId !== turn.taskId` check inside `resolveStepId` — the
 * tool lands without a `planStepId`, the AgentRosterCard's per-step
 * filter returns empty, and the row collapses to "Reasoning-only
 * delegate — final answer captured…" even though tools actually ran.
 */
import { describe, expect, test } from 'bun:test';
import { replayProcessLog, type PersistedTaskEvent } from './replay-process-log';

let nextSeq = 0;
function row(
  over: Partial<PersistedTaskEvent> & { eventType: string; taskId: string; ts: number },
): PersistedTaskEvent {
  nextSeq += 1;
  return {
    id: `${over.taskId}-${nextSeq}`,
    sessionId: over.sessionId ?? 'sess-1',
    seq: nextSeq,
    payload: over.payload ?? ({ taskId: over.taskId } as Record<string, unknown>),
    ...over,
  };
}

describe('replayProcessLog — descendant routing', () => {
  test('child agent:tool_executed lands on the matching delegate row (planStepId pinned via subTaskIdIndex)', () => {
    const PARENT = 'parent-1';
    const CHILD = 'child-1';
    const events: PersistedTaskEvent[] = [
      row({
        eventType: 'task:start',
        taskId: PARENT,
        ts: 100,
        scope: 'parent',
        payload: { input: { id: PARENT } },
      }),
      row({
        eventType: 'agent:plan_update',
        taskId: PARENT,
        ts: 110,
        scope: 'parent',
        payload: {
          taskId: PARENT,
          steps: [
            { id: 's1', label: 'Researcher', status: 'pending', strategy: 'delegate-sub-agent' },
          ],
        },
      }),
      row({
        eventType: 'workflow:delegate_dispatched',
        taskId: PARENT,
        ts: 120,
        scope: 'parent',
        payload: { taskId: PARENT, stepId: 's1', subTaskId: CHILD, agentId: 'researcher' },
      }),
      row({
        eventType: 'agent:tool_started',
        taskId: CHILD,
        ts: 130,
        scope: 'descendant',
        payload: { taskId: CHILD, toolCallId: 'tc-1', toolName: 'Read' },
      }),
      row({
        eventType: 'agent:tool_executed',
        taskId: CHILD,
        ts: 140,
        scope: 'descendant',
        payload: { taskId: CHILD, toolCallId: 'tc-1', toolName: 'Read', durationMs: 4 },
      }),
    ];
    const turn = replayProcessLog(events, { taskId: PARENT });
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0]?.planStepId).toBe('s1');
    expect(turn.toolCalls[0]?.name).toBe('Read');
    // Plan step adopted the toolCallId so AgentRosterCard's filter picks it up.
    const s1 = turn.planSteps.find((s) => s.id === 's1');
    expect(s1?.toolCallIds).toContain('tc-1');
  });

  test("child task:complete (scope='descendant') does not corrupt parent turn.taskId/status", () => {
    const PARENT = 'parent-2';
    const C1 = 'child-2a';
    const C2 = 'child-2b';
    const events: PersistedTaskEvent[] = [
      row({ eventType: 'task:start', taskId: PARENT, ts: 100, scope: 'parent', payload: { input: { id: PARENT } } }),
      row({
        eventType: 'agent:plan_update',
        taskId: PARENT,
        ts: 110,
        scope: 'parent',
        payload: {
          taskId: PARENT,
          steps: [
            { id: 's1', label: 'A', status: 'pending', strategy: 'delegate-sub-agent' },
            { id: 's2', label: 'B', status: 'pending', strategy: 'delegate-sub-agent' },
          ],
        },
      }),
      row({
        eventType: 'workflow:delegate_dispatched',
        taskId: PARENT,
        ts: 120,
        scope: 'parent',
        payload: { taskId: PARENT, stepId: 's1', subTaskId: C1 },
      }),
      row({
        eventType: 'workflow:delegate_dispatched',
        taskId: PARENT,
        ts: 121,
        scope: 'parent',
        payload: { taskId: PARENT, stepId: 's2', subTaskId: C2 },
      }),
      // C1 finishes early, BEFORE the parent.
      row({
        eventType: 'task:complete',
        taskId: C1,
        ts: 130,
        scope: 'descendant',
        payload: { result: { id: C1, status: 'completed', content: 'child-1 answer' } },
      }),
      // C2 then runs a tool. With the descendant guard, this still routes to s2.
      row({
        eventType: 'agent:tool_started',
        taskId: C2,
        ts: 140,
        scope: 'descendant',
        payload: { taskId: C2, toolCallId: 'tc-2', toolName: 'Grep' },
      }),
      row({
        eventType: 'agent:tool_executed',
        taskId: C2,
        ts: 150,
        scope: 'descendant',
        payload: { taskId: C2, toolCallId: 'tc-2', toolName: 'Grep', durationMs: 7 },
      }),
      // Parent's terminal lands last.
      row({
        eventType: 'task:complete',
        taskId: PARENT,
        ts: 160,
        scope: 'parent',
        payload: { result: { id: PARENT, status: 'completed', content: 'final synthesis' } },
      }),
    ];
    const turn = replayProcessLog(events, { taskId: PARENT });
    expect(turn.taskId).toBe(PARENT);
    expect(turn.status).toBe('done');
    expect(turn.finalContent).toBe('final synthesis');
    // C2's tool routed to s2, not to s1, not undefined.
    const s2Tools = turn.toolCalls.filter((c) => c.planStepId === 's2');
    expect(s2Tools.map((c) => c.name)).toEqual(['Grep']);
  });

  test('events with no scope (legacy mode) fall back to row-level taskId comparison', () => {
    // The fallback: when the backend response is the legacy per-task
    // shape (no `scope` annotation), `replayProcessLog` derives scope
    // from `event.taskId === rootTaskId`. Child rows still get tagged
    // 'descendant' so the reducer guard fires.
    const PARENT = 'parent-3';
    const CHILD = 'child-3';
    const events: PersistedTaskEvent[] = [
      // No `scope` field on any of these — replayProcessLog computes it.
      row({ eventType: 'task:start', taskId: PARENT, ts: 100, payload: { input: { id: PARENT } } }),
      row({
        eventType: 'agent:plan_update',
        taskId: PARENT,
        ts: 110,
        payload: {
          taskId: PARENT,
          steps: [{ id: 's1', label: 'r', status: 'pending', strategy: 'delegate-sub-agent' }],
        },
      }),
      row({
        eventType: 'workflow:delegate_dispatched',
        taskId: PARENT,
        ts: 120,
        payload: { taskId: PARENT, stepId: 's1', subTaskId: CHILD },
      }),
      row({
        eventType: 'task:complete',
        taskId: CHILD,
        ts: 130,
        payload: { result: { id: CHILD, status: 'completed', content: 'child' } },
      }),
      row({
        eventType: 'task:complete',
        taskId: PARENT,
        ts: 140,
        payload: { result: { id: PARENT, status: 'completed', content: 'parent' } },
      }),
    ];
    const turn = replayProcessLog(events, { taskId: PARENT });
    expect(turn.taskId).toBe(PARENT);
    expect(turn.finalContent).toBe('parent');
  });

  test('payload taskId backfill — row-level taskId is injected when payload omits it', () => {
    // The recorder's `extractIds` derives the row's task_id from
    // `payload.input.id` / `payload.result.id` when payload has no
    // top-level `taskId`. The row-level value is authoritative; the
    // replay path injects it into payload so the reducer's
    // `resolveStepId` can route the event correctly.
    const PARENT = 'parent-4';
    const CHILD = 'child-4';
    const events: PersistedTaskEvent[] = [
      row({ eventType: 'task:start', taskId: PARENT, ts: 100, scope: 'parent', payload: { input: { id: PARENT } } }),
      row({
        eventType: 'agent:plan_update',
        taskId: PARENT,
        ts: 110,
        scope: 'parent',
        payload: {
          taskId: PARENT,
          steps: [{ id: 's1', label: 'r', status: 'pending', strategy: 'delegate-sub-agent' }],
        },
      }),
      row({
        eventType: 'workflow:delegate_dispatched',
        taskId: PARENT,
        ts: 120,
        scope: 'parent',
        payload: { taskId: PARENT, stepId: 's1', subTaskId: CHILD },
      }),
      // Child tool with NO taskId on payload — only carried at row level.
      row({
        eventType: 'agent:tool_executed',
        taskId: CHILD,
        ts: 130,
        scope: 'descendant',
        payload: { toolCallId: 'tc-1', toolName: 'Read', durationMs: 5 },
      }),
    ];
    const turn = replayProcessLog(events, { taskId: PARENT });
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0]?.planStepId).toBe('s1');
  });
});
