/**
 * Tests for the per-turn SSE reducer that powers the live chat bubble.
 *
 * Focuses on `reduceTurn` (the pure function, exported for tests). Each
 * scenario folds a sequence of typed bus events into the turn shape and
 * asserts on the user-observable surfaces (status, planSteps, toolCalls,
 * stepOutputs, finalContent, processLog, pendingApproval, error).
 *
 * Run: bun test src/hooks/use-streaming-turn.test.ts
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import type { SSEEvent } from '@/lib/api-client';
import {
  emptyTurn,
  reduceTurn,
  useStreamingTurnStore,
  type StreamingTurn,
} from './use-streaming-turn';

let now = 1_700_000_000_000;
function ev<K extends string>(name: K, payload: Record<string, unknown> = {}): SSEEvent {
  now += 10;
  return { event: name, payload, ts: now };
}

function fold(turn: StreamingTurn, events: SSEEvent[]): StreamingTurn {
  return events.reduce((acc, e) => reduceTurn(acc, e), turn);
}

beforeEach(() => {
  now = 1_700_000_000_000;
  // Reset Zustand store state between tests
  useStreamingTurnStore.setState({ bySession: {}, taskSessionIndex: {} });
});

describe('reduceTurn — task lifecycle', () => {
  test('task:start populates taskId, routingLevel, engineId', () => {
    const t = reduceTurn(
      emptyTurn(),
      ev('task:start', {
        input: { id: 'task-1' },
        routing: { level: 2, model: 'claude-sonnet' },
      }),
    );
    expect(t.taskId).toBe('task-1');
    expect(t.routingLevel).toBe(2);
    expect(t.engineId).toBe('claude-sonnet');
  });

  test('two task:start events upsert — second real model overwrites preliminary "pending"', () => {
    // Backend emits a preliminary task:start at executeTaskCore entry with
    // model='pending' (so all strategies get one), then full-pipeline emits
    // again with the real routing decision. Reducer must take the real one.
    const t = fold(emptyTurn(), [
      ev('task:start', { input: { id: 'task-1' }, routing: { level: 0, model: 'pending' } }),
      ev('task:start', { input: { id: 'task-1' }, routing: { level: 2, model: 'claude-sonnet' } }),
    ]);
    expect(t.engineId).toBe('claude-sonnet');
    expect(t.routingLevel).toBe(2);
  });

  test('task:complete maps completed → done and overwrites finalContent', () => {
    const start = reduceTurn(emptyTurn({ taskId: 'task-1' }), ev('task:start', { input: { id: 'task-1' } }));
    const partial = reduceTurn(start, ev('agent:text_delta', { text: 'partial...' }));
    const done = reduceTurn(
      partial,
      ev('task:complete', { result: { id: 'task-1', status: 'completed', content: 'final answer' } }),
    );
    expect(done.status).toBe('done');
    expect(done.finalContent).toBe('final answer');
    expect(done.resultStatus).toBe('completed');
    expect(done.error).toBeUndefined();
  });

  test('task:complete with status=failed surfaces orchestrator content as error', () => {
    const t = reduceTurn(
      emptyTurn({ taskId: 'task-1' }),
      ev('task:complete', { result: { id: 'task-1', status: 'failed', content: 'wall-clock timeout @ 240s' } }),
    );
    expect(t.status).toBe('error');
    expect(t.error).toBe('wall-clock timeout @ 240s');
    expect(t.resultStatus).toBe('failed');
  });

  test('task:complete with status=partial keeps status=done (usable answer)', () => {
    const t = reduceTurn(
      emptyTurn({ taskId: 'task-1' }),
      ev('task:complete', { result: { id: 'task-1', status: 'partial', content: 'best-effort answer' } }),
    );
    expect(t.status).toBe('done');
    expect(t.resultStatus).toBe('partial');
    expect(t.finalContent).toBe('best-effort answer');
  });

  test('task:timeout reconstructs message when reason missing', () => {
    const t = reduceTurn(
      emptyTurn({ taskId: 'task-1' }),
      ev('task:timeout', {
        elapsedMs: 245_000,
        budgetMs: 240_000,
        currentStage: { phase: 'plan', stage: 'decomposing' },
      }),
    );
    expect(t.status).toBe('error');
    expect(t.error).toContain('245s');
    expect(t.error).toContain('plan:decomposing');
  });
});

describe('reduceTurn — phase advancement', () => {
  test('phase:timing advances currentPhase to the NEXT phase, not the completed one', () => {
    const t = reduceTurn(emptyTurn(), ev('phase:timing', { phase: 'perceive', durationMs: 50 }));
    // perceive just FINISHED → currentPhase should advance to comprehend
    expect(t.currentPhase).toBe('comprehend');
    expect(t.phaseTimings).toHaveLength(1);
    expect(t.phaseTimings[0]?.phase).toBe('perceive');
  });

  test('phase:timing on terminal phase (learn) holds the same phase', () => {
    const t = reduceTurn(emptyTurn(), ev('phase:timing', { phase: 'learn', durationMs: 50 }));
    expect(t.currentPhase).toBe('learn');
  });
});

describe('reduceTurn — plan steps + tool routing', () => {
  test('agent:plan_update preserves toolCallIds across snapshots', () => {
    const t1 = reduceTurn(
      emptyTurn(),
      ev('agent:plan_update', {
        steps: [
          { id: 's1', label: 'Read', status: 'running' },
          { id: 's2', label: 'Write', status: 'pending' },
        ],
      }),
    );
    const t2 = reduceTurn(t1, ev('agent:tool_started', { toolCallId: 'tc1', toolName: 'file_read' }));
    expect(t2.toolCalls[0]?.planStepId).toBe('s1');
    expect(t2.planSteps.find((s) => s.id === 's1')?.toolCallIds).toEqual(['tc1']);

    // New plan_update snapshot — must NOT wipe toolCallIds
    const t3 = reduceTurn(
      t2,
      ev('agent:plan_update', {
        steps: [
          { id: 's1', label: 'Read', status: 'done' },
          { id: 's2', label: 'Write', status: 'running' },
        ],
      }),
    );
    expect(t3.planSteps.find((s) => s.id === 's1')?.toolCallIds).toEqual(['tc1']);
  });

  test('content delta routes to running step output, not finalContent', () => {
    const t1 = reduceTurn(
      emptyTurn(),
      ev('agent:plan_update', { steps: [{ id: 's1', label: 'Step 1', status: 'running' }] }),
    );
    const t2 = reduceTurn(t1, ev('agent:text_delta', { text: 'step body' }));
    expect(t2.stepOutputs.s1).toBe('step body');
    expect(t2.finalContent).toBe('');
  });

  test('content delta with no running step appends to finalContent', () => {
    const t = reduceTurn(emptyTurn(), ev('agent:text_delta', { text: 'hello' }));
    expect(t.finalContent).toBe('hello');
  });

  test('workflow:step_complete maps completed→done, failed→failed, skipped→skipped', () => {
    const t1 = reduceTurn(
      emptyTurn(),
      ev('agent:plan_update', {
        steps: [
          { id: 'a', label: 'A', status: 'running' },
          { id: 'b', label: 'B', status: 'running' },
          { id: 'c', label: 'C', status: 'running' },
        ],
      }),
    );
    const t2 = fold(t1, [
      ev('workflow:step_complete', { stepId: 'a', status: 'completed' }),
      ev('workflow:step_complete', { stepId: 'b', status: 'failed' }),
      ev('workflow:step_complete', { stepId: 'c', status: 'skipped' }),
    ]);
    expect(t2.planSteps.find((s) => s.id === 'a')?.status).toBe('done');
    expect(t2.planSteps.find((s) => s.id === 'b')?.status).toBe('failed');
    expect(t2.planSteps.find((s) => s.id === 'c')?.status).toBe('skipped');
  });
});

describe('reduceTurn — tool call dedup + finalisation', () => {
  test('tool_started then tool_executed updates the same entry, not a duplicate', () => {
    const t = fold(emptyTurn(), [
      ev('agent:tool_started', { toolCallId: 'tc1', toolName: 'file_read', args: { path: 'x.ts' } }),
      ev('agent:tool_executed', { toolCallId: 'tc1', toolName: 'file_read', durationMs: 12, result: 'ok' }),
    ]);
    expect(t.toolCalls).toHaveLength(1);
    expect(t.toolCalls[0]?.status).toBe('success');
    expect(t.toolCalls[0]?.durationMs).toBe(12);
    expect(t.toolCalls[0]?.result).toBe('ok');
  });

  test('agent:tool_executed with isError=true marks status=error', () => {
    const t = reduceTurn(
      emptyTurn(),
      ev('agent:tool_executed', { toolCallId: 'tc1', toolName: 'bash', isError: true, result: 'oops' }),
    );
    expect(t.toolCalls[0]?.status).toBe('error');
  });

  test('agent:tool_executed with success=false (legacy field) maps to error', () => {
    const t = reduceTurn(
      emptyTurn(),
      ev('agent:tool_executed', { toolCallId: 'tc1', toolName: 'bash', success: false }),
    );
    expect(t.toolCalls[0]?.status).toBe('error');
  });
});

describe('reduceTurn — legacy↔rich stream dedup', () => {
  test('rich content delta is suppressed when it duplicates the most recent legacy delta', () => {
    const t = fold(emptyTurn(), [
      ev('agent:text_delta', { text: 'hello' }),
      ev('llm:stream_delta', { kind: 'content', text: 'hello' }),
    ]);
    expect(t.finalContent).toBe('hello');
  });

  test('once rich source is active, subsequent legacy deltas are ignored', () => {
    const t = fold(emptyTurn(), [
      ev('llm:stream_delta', { kind: 'content', text: 'rich-' }),
      ev('agent:text_delta', { text: 'IGNORED' }),
      ev('llm:stream_delta', { kind: 'content', text: 'tail' }),
    ]);
    expect(t.finalContent).toBe('rich-tail');
  });

  test('thinking deltas accumulate separately from content', () => {
    const t = fold(emptyTurn(), [
      ev('llm:stream_delta', { kind: 'thinking', text: 'reasoning ' }),
      ev('llm:stream_delta', { kind: 'thinking', text: 'continues' }),
      ev('llm:stream_delta', { kind: 'content', text: 'answer' }),
    ]);
    expect(t.thinking).toBe('reasoning continues');
    expect(t.finalContent).toBe('answer');
  });
});

describe('reduceTurn — workflow approval gate', () => {
  test('workflow:plan_ready with awaitingApproval=true sets pendingApproval and pauses', () => {
    const t = reduceTurn(
      emptyTurn({ taskId: 'task-1' }),
      ev('workflow:plan_ready', {
        taskId: 'task-1',
        goal: 'do thing',
        awaitingApproval: true,
        steps: [{ id: 's1', description: 'first', strategy: 'auto', dependencies: [] }],
      }),
    );
    expect(t.status).toBe('awaiting-approval');
    expect(t.pendingApproval?.steps).toHaveLength(1);
  });

  test('workflow:plan_ready without awaitingApproval does NOT set pending approval', () => {
    const start = emptyTurn({ taskId: 'task-1' });
    const t = reduceTurn(start, ev('workflow:plan_ready', { taskId: 'task-1', steps: [], awaitingApproval: false }));
    expect(t.pendingApproval).toBeUndefined();
    expect(t.status).toBe('running');
  });

  test('workflow:plan_approved clears pendingApproval and resumes', () => {
    const t = fold(emptyTurn(), [
      ev('workflow:plan_ready', {
        awaitingApproval: true,
        steps: [{ id: 's1', description: 'x', strategy: 'auto', dependencies: [] }],
      }),
      ev('workflow:plan_approved', {}),
    ]);
    expect(t.status).toBe('running');
    expect(t.pendingApproval).toBeUndefined();
  });

  test('workflow:plan_rejected emits error with reason', () => {
    const t = fold(emptyTurn(), [
      ev('workflow:plan_ready', {
        awaitingApproval: true,
        steps: [{ id: 's1', description: 'x', strategy: 'auto', dependencies: [] }],
      }),
      ev('workflow:plan_rejected', { reason: 'user said no' }),
    ]);
    expect(t.status).toBe('error');
    expect(t.error).toBe('user said no');
  });

  test('task:complete should clear pendingApproval if it was somehow still set', () => {
    // This is the bug case: if the orchestrator races and emits task:complete
    // before plan_approved/rejected, the bubble would show both the
    // approval card AND the final answer.
    const t = fold(emptyTurn(), [
      ev('workflow:plan_ready', {
        awaitingApproval: true,
        steps: [{ id: 's1', description: 'x', strategy: 'auto', dependencies: [] }],
      }),
      ev('task:complete', { result: { id: 'task-1', status: 'completed', content: 'done' } }),
    ]);
    expect(t.status).toBe('done');
    expect(t.pendingApproval).toBeUndefined();
  });
});

describe('reduceTurn — process log', () => {
  test('skill:match appends a process log entry', () => {
    const t = reduceTurn(emptyTurn(), ev('skill:match', { skill: { name: 'sqlite-evo' } }));
    expect(t.processLog).toHaveLength(1);
    expect(t.processLog[0]?.kind).toBe('skill_match');
    expect(t.processLog[0]?.label).toContain('sqlite-evo');
  });

  test('process log is capped at PROCESS_LOG_MAX (50) entries via FIFO', () => {
    let t = emptyTurn();
    for (let i = 0; i < 60; i++) {
      t = reduceTurn(t, ev('skill:match', { skill: { name: `skill-${i}` } }));
    }
    expect(t.processLog).toHaveLength(50);
    // Oldest dropped, newest kept
    expect(t.processLog[0]?.label).toContain('skill-10');
    expect(t.processLog[49]?.label).toContain('skill-59');
  });

  test('multiple process events with the same kind+timestamp must have unique ids', () => {
    // Bug case: ids are `${kind}-${ts}` — two events in the same ms collide.
    const fixed: SSEEvent = { event: 'skill:match', payload: { skill: { name: 'a' } }, ts: 12345 };
    const fixed2: SSEEvent = { event: 'skill:match', payload: { skill: { name: 'b' } }, ts: 12345 };
    const t = fold(emptyTurn(), [fixed, fixed2]);
    const ids = new Set(t.processLog.map((p) => p.id));
    expect(ids.size).toBe(2);
  });
});

describe('reduceTurn — clarifications', () => {
  test('agent:clarification_requested sets status=input-required and accumulates questions', () => {
    const t = fold(emptyTurn(), [
      ev('agent:clarification_requested', { questions: ['What format?', 'Which file?'] }),
    ]);
    expect(t.status).toBe('input-required');
    expect(t.clarifications).toEqual(['What format?', 'Which file?']);
  });

  test('repeated clarification text is preserved (UI dedups via index keys, not value)', () => {
    // Regression guard for interrupt-banner.tsx:37 — the reducer no longer
    // dedups questions, so the same prompt text can recur. The UI must
    // stable-key by index to avoid React reconciliation bugs.
    const t = fold(emptyTurn(), [
      ev('agent:clarification_requested', { question: 'Which file?' }),
      ev('agent:clarification_requested', { question: 'Which file?' }),
    ]);
    expect(t.clarifications).toEqual(['Which file?', 'Which file?']);
  });
});

describe('reduceTurn — escalations + tokens', () => {
  test('task:escalate updates routingLevel and appends entry', () => {
    const t = reduceTurn(emptyTurn(), ev('task:escalate', { fromLevel: 1, toLevel: 2, reason: 'oracle fail' }));
    expect(t.routingLevel).toBe(2);
    expect(t.escalations).toHaveLength(1);
    expect(t.escalations[0]?.reason).toBe('oracle fail');
  });

  test('agent:turn_complete accumulates tokensConsumed across turns', () => {
    const t = fold(emptyTurn(), [
      ev('agent:turn_complete', { tokensConsumed: 100 }),
      ev('agent:turn_complete', { tokensConsumed: 250 }),
    ]);
    expect(t.tokensConsumed).toBe(350);
  });
});

describe('useStreamingTurnStore — bubble lifecycle', () => {
  test('start creates an empty turn for the session', () => {
    useStreamingTurnStore.getState().start('s1');
    const turn = useStreamingTurnStore.getState().bySession.s1;
    expect(turn?.status).toBe('running');
    expect(turn?.recovered).toBeUndefined();
  });

  test('clear leaves a still-running turn alone (defends vs stale setTimeout race)', () => {
    useStreamingTurnStore.getState().start('s1');
    useStreamingTurnStore.getState().clear('s1');
    expect(useStreamingTurnStore.getState().bySession.s1).toBeDefined();
  });

  test('clear removes a done turn', () => {
    useStreamingTurnStore.getState().start('s1');
    useStreamingTurnStore.getState().ingest(
      's1',
      ev('task:complete', { result: { id: 't1', status: 'completed', content: 'ok' } }),
    );
    useStreamingTurnStore.getState().clear('s1');
    expect(useStreamingTurnStore.getState().bySession.s1).toBeUndefined();
  });

  test('setError flips a running turn into error state', () => {
    useStreamingTurnStore.getState().start('s1');
    useStreamingTurnStore.getState().setError('s1', 'fetch failed');
    const turn = useStreamingTurnStore.getState().bySession.s1;
    expect(turn?.status).toBe('error');
    expect(turn?.error).toBe('fetch failed');
  });

  test('hydrateRunningTask restores a recovered turn after page reload', () => {
    useStreamingTurnStore.getState().hydrateRunningTask('s1', 'task-99');
    const turn = useStreamingTurnStore.getState().bySession.s1;
    expect(turn?.taskId).toBe('task-99');
    expect(turn?.recovered).toBe(true);
    expect(useStreamingTurnStore.getState().taskSessionIndex['task-99']).toBe('s1');
  });

  test('ingestGlobal updates only recovered turns (skips POST-stream ones)', () => {
    // Simulate an in-flight POST-stream turn (not recovered)
    useStreamingTurnStore.getState().start('s1');
    useStreamingTurnStore.getState().ingest('s1', ev('task:start', { input: { id: 'task-A' } }));
    const before = useStreamingTurnStore.getState().bySession.s1;

    // Global SSE delivers a duplicate event for the same task — must NOT mutate
    useStreamingTurnStore.getState().ingestGlobal({
      event: 'agent:text_delta',
      payload: { taskId: 'task-A', text: 'GLOBAL' },
      ts: now + 1,
    });
    const after = useStreamingTurnStore.getState().bySession.s1;
    // No content should be appended via global path
    expect(after?.finalContent).toBe(before?.finalContent);
  });
});

describe('reduceTurn — multi-agent (AgentTimelineCard data)', () => {
  test('agent:plan_update preserves agentId + strategy from backend snapshot', () => {
    const t = reduceTurn(
      emptyTurn(),
      ev('agent:plan_update', {
        steps: [
          {
            id: 'step1',
            label: 'Generate question',
            status: 'pending',
            strategy: 'llm-reasoning',
          },
          {
            id: 'step2',
            label: 'Researcher answers',
            status: 'pending',
            strategy: 'delegate-sub-agent',
            agentId: 'researcher',
          },
          {
            id: 'step3',
            label: 'Author answers',
            status: 'pending',
            strategy: 'delegate-sub-agent',
            agentId: 'author',
          },
        ],
      }),
    );
    expect(t.planSteps).toHaveLength(3);
    expect(t.planSteps[1]!.agentId).toBe('researcher');
    expect(t.planSteps[1]!.strategy).toBe('delegate-sub-agent');
    expect(t.planSteps[2]!.agentId).toBe('author');
    // Setup step has strategy but no agentId — distinguishable from delegates.
    expect(t.planSteps[0]!.strategy).toBe('llm-reasoning');
    expect(t.planSteps[0]!.agentId).toBeUndefined();
  });

  test('workflow:delegate_dispatched pins agentId + flips matching step to running', () => {
    const seeded = fold(emptyTurn(), [
      ev('agent:plan_update', {
        steps: [
          {
            id: 'step2',
            label: 'Researcher answers',
            status: 'pending',
            strategy: 'delegate-sub-agent',
            agentId: 'researcher',
          },
        ],
      }),
      ev('workflow:delegate_dispatched', {
        taskId: 'parent-1',
        stepId: 'step2',
        agentId: 'researcher',
        subTaskId: 'parent-1-delegate-step2',
        stepDescription: 'Researcher answers',
      }),
    ]);
    const step = seeded.planSteps.find((s) => s.id === 'step2')!;
    expect(step.agentId).toBe('researcher');
    expect(step.subTaskId).toBe('parent-1-delegate-step2');
    expect(step.status).toBe('running');
    expect(step.startedAt).toBeDefined();
  });

  test('workflow:delegate_completed captures outputPreview + maps completed → done', () => {
    const seeded = fold(emptyTurn(), [
      ev('agent:plan_update', {
        steps: [
          {
            id: 'step2',
            label: 'Researcher',
            status: 'running',
            strategy: 'delegate-sub-agent',
            agentId: 'researcher',
          },
        ],
      }),
      ev('workflow:delegate_completed', {
        taskId: 'parent-1',
        stepId: 'step2',
        subTaskId: 'parent-1-delegate-step2',
        agentId: 'researcher',
        status: 'completed',
        outputPreview: 'Empirical analysis says X',
        tokensUsed: 100,
      }),
    ]);
    const step = seeded.planSteps.find((s) => s.id === 'step2')!;
    expect(step.outputPreview).toBe('Empirical analysis says X');
    expect(step.status).toBe('done');
    expect(step.finishedAt).toBeDefined();
    // Plumbed into stepOutputs so PlanSurface's existing step expansion
    // renders the per-agent answer without a redundant standalone card.
    expect(seeded.stepOutputs.step2).toBe('Empirical analysis says X');
  });

  test('workflow:delegate_completed with status=failed surfaces failure (no fabrication)', () => {
    const seeded = fold(emptyTurn(), [
      ev('agent:plan_update', {
        steps: [
          {
            id: 'step3',
            label: 'Author',
            status: 'running',
            strategy: 'delegate-sub-agent',
            agentId: 'author',
          },
        ],
      }),
      ev('workflow:delegate_completed', {
        taskId: 'parent-1',
        stepId: 'step3',
        subTaskId: 'parent-1-delegate-step3',
        agentId: 'author',
        status: 'failed',
        outputPreview: 'delegate-sub-agent step step3 timed out after 120s (agent=author)',
        tokensUsed: 0,
      }),
    ]);
    const step = seeded.planSteps.find((s) => s.id === 'step3')!;
    expect(step.status).toBe('failed');
    expect(step.outputPreview).toContain('timed out');
  });

  test('agent:plan_update preserves outputPreview from prior delegate_completed', () => {
    // Common race: delegate_completed arrives, then a stale plan_update from
    // the executor's mid-loop snapshot fires. The reducer must NOT clobber
    // the captured outputPreview when re-snapshotting steps.
    const seeded = fold(emptyTurn(), [
      ev('agent:plan_update', {
        steps: [
          {
            id: 'step2',
            label: 'Researcher',
            status: 'running',
            strategy: 'delegate-sub-agent',
            agentId: 'researcher',
          },
        ],
      }),
      ev('workflow:delegate_completed', {
        stepId: 'step2',
        agentId: 'researcher',
        status: 'completed',
        outputPreview: 'real answer',
      }),
      ev('agent:plan_update', {
        steps: [
          {
            id: 'step2',
            label: 'Researcher',
            status: 'done',
            strategy: 'delegate-sub-agent',
            agentId: 'researcher',
          },
        ],
      }),
    ]);
    const step = seeded.planSteps.find((s) => s.id === 'step2')!;
    expect(step.outputPreview).toBe('real answer');
    expect(step.status).toBe('done');
  });
});
