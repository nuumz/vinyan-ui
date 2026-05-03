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

  test('task:complete sweeps lingering pending/running plan steps to done on success', () => {
    // Reproduces the "4/5" symptom: backend doesn't always emit
    // workflow:step_complete for the final step (synthesizer absorbs it),
    // so the UI used to show step5 as still pending after the success card.
    let turn = emptyTurn({ taskId: 'task-1' });
    turn = {
      ...turn,
      planSteps: [
        { id: 'step1', label: '1', status: 'done', toolCallIds: [] },
        { id: 'step2', label: '2', status: 'done', toolCallIds: [] },
        { id: 'step3', label: '3', status: 'done', toolCallIds: [] },
        { id: 'step4', label: '4', status: 'done', toolCallIds: [] },
        { id: 'step5', label: '5', status: 'pending', toolCallIds: [] },
      ],
    };
    const next = reduceTurn(
      turn,
      ev('task:complete', { result: { id: 'task-1', status: 'completed', content: 'final synthesis' } }),
    );
    expect(next.status).toBe('done');
    expect(next.planSteps.every((s) => s.status === 'done')).toBe(true);
    expect(next.planSteps[4]!.finishedAt).toBeDefined();
  });

  test('task:complete on error marks running steps as failed but leaves pending alone', () => {
    let turn = emptyTurn({ taskId: 'task-1' });
    turn = {
      ...turn,
      planSteps: [
        { id: 'step1', label: '1', status: 'done', toolCallIds: [] },
        { id: 'step2', label: '2', status: 'running', toolCallIds: [] },
        { id: 'step3', label: '3', status: 'pending', toolCallIds: [] },
      ],
    };
    const next = reduceTurn(
      turn,
      ev('task:complete', { result: { id: 'task-1', status: 'failed', content: 'wall-clock timeout' } }),
    );
    expect(next.status).toBe('error');
    expect(next.planSteps[0]!.status).toBe('done');
    expect(next.planSteps[1]!.status).toBe('failed');
    expect(next.planSteps[2]!.status).toBe('pending');
  });

  test('task:complete leaves skipped steps as skipped on success', () => {
    let turn = emptyTurn({ taskId: 'task-1' });
    turn = {
      ...turn,
      planSteps: [
        { id: 'step1', label: '1', status: 'done', toolCallIds: [] },
        { id: 'step2', label: '2', status: 'skipped', toolCallIds: [] },
        { id: 'step3', label: '3', status: 'pending', toolCallIds: [] },
      ],
    };
    const next = reduceTurn(
      turn,
      ev('task:complete', { result: { id: 'task-1', status: 'completed', content: 'ok' } }),
    );
    expect(next.planSteps[1]!.status).toBe('skipped');
    expect(next.planSteps[2]!.status).toBe('done');
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

describe('reduceTurn — plan-step status monotonicity & timestamp invariant', () => {
  // Repros for session d4aa26fa-73f1-4ad5-8b16-8727c15ee421: a multi-agent
  // DEBATE task that finished cleanly but the synthesizer step (step 6)
  // rendered as still pending with a `-42854ms` duration. Two distinct
  // bugs converged there — a stale plan_update reverting a swept terminal
  // status, and a startedAt that landed AFTER finishedAt because of
  // out-of-order events.

  test('agent:plan_update cannot regress a step from done back to pending', () => {
    // First snapshot lands the step in `done`. A subsequent plan_update
    // captured BEFORE the step settled (stale snapshot, common when the
    // executor batches plan_updates and the synth step short-circuits)
    // arrives carrying status='pending'. Without monotonicity the bubble
    // shows a Done task with a still-pending step — incoherent.
    const t = fold(emptyTurn({ taskId: 't-1' }), [
      ev('task:start', { input: { id: 't-1' } }),
      ev('agent:plan_update', {
        taskId: 't-1',
        steps: [{ id: 'step6', label: 'synth', status: 'done' }],
      }),
      ev('agent:plan_update', {
        taskId: 't-1',
        steps: [{ id: 'step6', label: 'synth', status: 'pending' }],
      }),
    ]);
    expect(t.planSteps[0]!.status).toBe('done');
  });

  test('agent:plan_update preserves task:complete sweep against late stale snapshot', () => {
    // Concrete repro flow:
    //   1. plan_update marks step6 as `pending`
    //   2. task:complete fires with status=completed → sweep flips
    //      step6 to `done`
    //   3. A late plan_update (the executor's final step-state snapshot
    //      that was captured before settle) re-asserts step6=pending
    // Without the monotonicity guard, step 3 unwinds the sweep.
    const t = fold(emptyTurn({ taskId: 't-1' }), [
      ev('task:start', { input: { id: 't-1' } }),
      ev('agent:plan_update', {
        taskId: 't-1',
        steps: [{ id: 'step6', label: 'synth', status: 'pending' }],
      }),
      ev('task:complete', {
        result: { id: 't-1', status: 'completed', content: 'final' },
      }),
      ev('agent:plan_update', {
        taskId: 't-1',
        steps: [{ id: 'step6', label: 'synth', status: 'pending' }],
      }),
    ]);
    expect(t.status).toBe('done');
    expect(t.planSteps[0]!.status).toBe('done');
  });

  test('agent:plan_update lands directly in done — pegs startedAt to finishedAt (zero duration)', () => {
    // No prior `running` snapshot for this step (workflow short-circuits
    // a synth-style step). The first time we see it, status is `done`.
    // Without the peg, startedAt would be undefined and the duration
    // formula `finishedAt - startedAt` evaluates to NaN.
    const t = fold(emptyTurn({ taskId: 't-1' }), [
      ev('task:start', { input: { id: 't-1' } }),
      ev('agent:plan_update', {
        taskId: 't-1',
        steps: [{ id: 'stepA', label: 'A', status: 'done' }],
      }),
    ]);
    const step = t.planSteps[0]!;
    expect(step.status).toBe('done');
    expect(step.startedAt).toBeDefined();
    expect(step.finishedAt).toBeDefined();
    expect(step.startedAt).toBe(step.finishedAt!);
  });

  test('out-of-order step_complete + plan_update never produces inverted timestamps', () => {
    // Reproduces the `-42854ms` bug:
    //   1. workflow:step_complete bootstraps step6 with finishedAt = T0
    //      (no prior plan_update or step_start)
    //   2. A late plan_update arrives carrying step6 still in a pre-
    //      settle state — the reducer would otherwise leave finishedAt
    //      at T0 (first-seen wins) but newly assign startedAt = T1 > T0
    //      from the running fallback, locking in startedAt > finishedAt.
    const t = fold(emptyTurn({ taskId: 't-1' }), [
      ev('task:start', { input: { id: 't-1' } }),
      ev('workflow:step_complete', {
        taskId: 't-1',
        stepId: 'step6',
        status: 'completed',
      }),
      ev('agent:plan_update', {
        taskId: 't-1',
        steps: [{ id: 'step6', label: 'synth', status: 'running' }],
      }),
    ]);
    const step = t.planSteps.find((s) => s.id === 'step6')!;
    // Status stays terminal — monotonicity guard refuses the regression.
    expect(step.status).toBe('done');
    // Timestamps are coherent: startedAt <= finishedAt.
    expect(step.startedAt).toBeDefined();
    expect(step.finishedAt).toBeDefined();
    expect(step.startedAt!).toBeLessThanOrEqual(step.finishedAt!);
    // The duration formula used by plan-surface produces a non-negative
    // value (the user-visible defect was specifically the negative one).
    expect(step.finishedAt! - step.startedAt!).toBeGreaterThanOrEqual(0);
  });

  test('workflow:step_complete bootstrap pins startedAt to finishedAt', () => {
    // When a step is created entirely from a `workflow:step_complete`
    // event (no prior plan_update or step_start), the bootstrap row
    // must carry both timestamps to keep duration math valid. The
    // honest signal is "settled at T, separate start unknown" → render
    // as 0 rather than NaN.
    const t = fold(emptyTurn({ taskId: 't-1' }), [
      ev('task:start', { input: { id: 't-1' } }),
      ev('workflow:step_complete', {
        taskId: 't-1',
        stepId: 'orphan-step',
        status: 'completed',
      }),
    ]);
    const step = t.planSteps.find((s) => s.id === 'orphan-step')!;
    expect(step.status).toBe('done');
    expect(step.startedAt).toBeDefined();
    expect(step.finishedAt).toBeDefined();
    expect(step.startedAt).toBe(step.finishedAt!);
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

  test('workflow:plan_ready stores approvalMode + timeoutMs + autoDecisionAllowed (agent-discretion)', () => {
    const t = reduceTurn(
      emptyTurn({ taskId: 'task-1' }),
      ev('workflow:plan_ready', {
        taskId: 'task-1',
        goal: 'do thing',
        awaitingApproval: true,
        approvalMode: 'agent-discretion',
        timeoutMs: 180_000,
        autoDecisionAllowed: true,
        steps: [{ id: 's1', description: 'first', strategy: 'auto', dependencies: [] }],
      }),
    );
    expect(t.pendingApproval?.approvalMode).toBe('agent-discretion');
    expect(t.pendingApproval?.timeoutMs).toBe(180_000);
    expect(t.pendingApproval?.autoDecisionAllowed).toBe(true);
  });

  test('workflow:plan_ready stores human-required mode with autoDecisionAllowed=false', () => {
    const t = reduceTurn(
      emptyTurn({ taskId: 'task-1' }),
      ev('workflow:plan_ready', {
        taskId: 'task-1',
        goal: 'choose one',
        awaitingApproval: true,
        approvalMode: 'human-required',
        timeoutMs: 180_000,
        autoDecisionAllowed: false,
        steps: [{ id: 's1', description: 'choose', strategy: 'human-input', dependencies: [] }],
      }),
    );
    expect(t.pendingApproval?.approvalMode).toBe('human-required');
    expect(t.pendingApproval?.autoDecisionAllowed).toBe(false);
  });

  test('workflow:plan_ready without new fields stays back-compatible (mode undefined)', () => {
    const t = reduceTurn(
      emptyTurn({ taskId: 'task-1' }),
      ev('workflow:plan_ready', {
        taskId: 'task-1',
        goal: 'do thing',
        awaitingApproval: true,
        steps: [{ id: 's1', description: 'first', strategy: 'auto', dependencies: [] }],
      }),
    );
    expect(t.pendingApproval?.approvalMode).toBeUndefined();
    expect(t.pendingApproval?.timeoutMs).toBeUndefined();
    expect(t.pendingApproval?.autoDecisionAllowed).toBeUndefined();
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

describe('reduceTurn — workflow human-input', () => {
  test('workflow:human_input_needed sets pendingHumanInput and pauses', () => {
    const t = reduceTurn(
      emptyTurn({ taskId: 'task-1' }),
      ev('workflow:human_input_needed', {
        taskId: 'task-1',
        stepId: 'step1',
        question: 'Ask the user for the topic',
      }),
    );
    expect(t.status).toBe('awaiting-human-input');
    expect(t.pendingHumanInput?.stepId).toBe('step1');
    expect(t.pendingHumanInput?.question).toBe('Ask the user for the topic');
  });

  test('workflow:human_input_provided clears pendingHumanInput and resumes', () => {
    const t = fold(emptyTurn({ taskId: 'task-1' }), [
      ev('workflow:human_input_needed', {
        taskId: 'task-1',
        stepId: 'step1',
        question: 'Topic?',
      }),
      ev('workflow:human_input_provided', {
        taskId: 'task-1',
        stepId: 'step1',
        value: 'Quantum computing',
      }),
    ]);
    expect(t.status).toBe('running');
    expect(t.pendingHumanInput).toBeUndefined();
  });

  test('mismatched taskId is ignored — pendingHumanInput stays unset', () => {
    const t = reduceTurn(
      emptyTurn({ taskId: 'task-1' }),
      ev('workflow:human_input_needed', {
        taskId: 'other-task',
        stepId: 'step1',
        question: 'Topic?',
      }),
    );
    expect(t.status).not.toBe('awaiting-human-input');
    expect(t.pendingHumanInput).toBeUndefined();
  });

  test('task:complete clears pendingHumanInput if still set', () => {
    const t = fold(emptyTurn({ taskId: 'task-1' }), [
      ev('workflow:human_input_needed', {
        taskId: 'task-1',
        stepId: 'step1',
        question: 'Topic?',
      }),
      ev('task:complete', { result: { id: 'task-1', status: 'completed', content: 'done' } }),
    ]);
    expect(t.status).toBe('done');
    expect(t.pendingHumanInput).toBeUndefined();
  });

  test('plan_rejected clears pendingHumanInput too', () => {
    const t = fold(emptyTurn({ taskId: 'task-1' }), [
      ev('workflow:human_input_needed', {
        taskId: 'task-1',
        stepId: 'step1',
        question: 'Topic?',
      }),
      ev('workflow:plan_rejected', { reason: 'aborted' }),
    ]);
    expect(t.status).toBe('error');
    expect(t.pendingHumanInput).toBeUndefined();
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

  test('hydrateRunningTask preserves a replayed awaiting-approval turn on a re-fire', () => {
    // Reproduces the bug seen on session refresh against a workflow plan
    // that's parked at the approval gate:
    //   1) hydrate creates an empty `running` recovered shell.
    //   2) replayInto reduces the persisted plan_ready event → status
    //      flips to `awaiting-approval`, pendingApproval populated.
    //   3) SessionChat's effect re-fires (turn is in its deps) and
    //      calls hydrate again with the SAME taskId.
    //
    // Before this guard, step 3 wiped the replayed turn (because the
    // narrow `prev.status === 'running'` check missed `awaiting-approval`),
    // and the recover hook's `lastReplayedRef` then refused to re-run.
    // The chat stranded on a quiet "Planning · Decomposing" header
    // forever despite event-history being on disk and fetched.
    useStreamingTurnStore.getState().hydrateRunningTask('s1', 'task-pending');
    useStreamingTurnStore.getState().replayInto('s1', 'task-pending', [
      { eventType: 'task:start', payload: { input: { id: 'task-pending' } }, ts: now },
      {
        eventType: 'workflow:plan_ready',
        payload: {
          taskId: 'task-pending',
          goal: 'multi-agent debate',
          steps: [
            { id: 'step1', description: 'agent A answers', strategy: 'delegate-sub-agent', dependencies: [] },
          ],
          awaitingApproval: true,
          approvalMode: 'agent-discretion',
          timeoutMs: 180_000,
          autoDecisionAllowed: true,
        },
        ts: now + 1,
      },
    ]);

    const before = useStreamingTurnStore.getState().bySession.s1;
    expect(before?.status).toBe('awaiting-approval');
    expect(before?.pendingApproval?.steps.length).toBe(1);

    // Re-fire hydrate (simulates SessionChat's useEffect running again
    // after `turn` changed in its dep list).
    useStreamingTurnStore.getState().hydrateRunningTask('s1', 'task-pending');

    const after = useStreamingTurnStore.getState().bySession.s1;
    expect(after?.status).toBe('awaiting-approval');
    expect(after?.pendingApproval?.steps.length).toBe(1);
    expect(after?.pendingApproval?.goal).toBe('multi-agent debate');
  });

  test('hydrateRunningTask preserves a replayed awaiting-human-input turn on a re-fire', () => {
    // Same invariant as the approval-gate test, but for the workflow
    // human-input pause. Without the broader status guard, a turn
    // paused on a clarification would also lose `pendingHumanInput`
    // when the SessionChat effect re-fired.
    useStreamingTurnStore.getState().hydrateRunningTask('s1', 'task-input');
    useStreamingTurnStore.getState().replayInto('s1', 'task-input', [
      { eventType: 'task:start', payload: { input: { id: 'task-input' } }, ts: now },
      {
        eventType: 'workflow:human_input_needed',
        payload: { taskId: 'task-input', stepId: 'h1', question: 'Which file should I read?' },
        ts: now + 1,
      },
    ]);

    expect(useStreamingTurnStore.getState().bySession.s1?.status).toBe('awaiting-human-input');

    useStreamingTurnStore.getState().hydrateRunningTask('s1', 'task-input');

    const after = useStreamingTurnStore.getState().bySession.s1;
    expect(after?.status).toBe('awaiting-human-input');
    expect(after?.pendingHumanInput?.question).toBe('Which file should I read?');
  });

  test('plan_ready (awaiting=false) populates planSteps so the chat surfaces render', () => {
    // Auto-approved multi-agent workflows emit `plan_ready` with
    // `awaitingApproval: false` and never re-emit the steps via
    // `agent:plan_update`. Before this fix the reducer early-returned
    // on awaiting=false → `turn.planSteps` stayed empty →
    // `delegate_dispatched`'s .map no-op'd against empty steps →
    // `hasDelegateRows=false` in the surface policy → AgentTimelineCard /
    // PlanSurface never rendered → chat bubble stranded on
    // "Planning · Decomposing the task" forever.
    useStreamingTurnStore.getState().start('s1');
    useStreamingTurnStore.getState().ingest('s1', ev('task:start', { input: { id: 'task-mw' } }));
    useStreamingTurnStore
      .getState()
      .ingest(
        's1',
        ev('workflow:plan_ready', {
          taskId: 'task-mw',
          goal: 'multi-agent debate',
          steps: [
            {
              id: 'p-architect',
              description: 'architect answers',
              strategy: 'delegate-sub-agent',
              dependencies: [],
              agentId: 'architect',
            },
            {
              id: 'p-author',
              description: 'author answers',
              strategy: 'delegate-sub-agent',
              dependencies: [],
              agentId: 'author',
            },
            {
              id: 'p-coordinator',
              description: 'coordinator synthesizes',
              strategy: 'llm-reasoning',
              dependencies: ['p-architect', 'p-author'],
            },
          ],
          awaitingApproval: false,
        }),
      );

    const turn = useStreamingTurnStore.getState().bySession.s1;
    expect(turn?.planSteps).toHaveLength(3);
    expect(turn?.planSteps[0]).toMatchObject({
      id: 'p-architect',
      label: 'architect answers',
      status: 'pending',
      strategy: 'delegate-sub-agent',
      agentId: 'architect',
    });
    // Auto-approved means status stays at the live signal, NOT awaiting-approval.
    expect(turn?.status).not.toBe('awaiting-approval');
    expect(turn?.pendingApproval).toBeUndefined();
  });

  test('plan_ready (awaiting=true) populates planSteps AND pendingApproval', () => {
    // Both surfaces should reflect the gate: pendingApproval drives the
    // approval card (Approve / Reject buttons), planSteps drives the
    // plan checklist + agent timeline. They were two independent slices
    // before; this test pins their co-population so a future regression
    // that bails early on awaiting=true would surface immediately.
    useStreamingTurnStore.getState().start('s1');
    useStreamingTurnStore.getState().ingest('s1', ev('task:start', { input: { id: 'task-aw' } }));
    useStreamingTurnStore
      .getState()
      .ingest(
        's1',
        ev('workflow:plan_ready', {
          taskId: 'task-aw',
          goal: 'gated workflow',
          steps: [
            {
              id: 's1',
              description: 'first step',
              strategy: 'delegate-sub-agent',
              dependencies: [],
            },
          ],
          awaitingApproval: true,
          approvalMode: 'agent-discretion',
          timeoutMs: 60_000,
          autoDecisionAllowed: true,
        }),
      );

    const turn = useStreamingTurnStore.getState().bySession.s1;
    expect(turn?.status).toBe('awaiting-approval');
    expect(turn?.planSteps).toHaveLength(1);
    expect(turn?.planSteps[0]?.label).toBe('first step');
    expect(turn?.pendingApproval?.steps).toHaveLength(1);
    expect(turn?.pendingApproval?.approvalMode).toBe('agent-discretion');
    expect(turn?.pendingApproval?.timeoutMs).toBe(60_000);
  });

  test('plan_ready merges with previously dispatched delegate steps (preserves agentId/subTaskId)', () => {
    // delegate_dispatched can fire BEFORE plan_ready in race conditions
    // (e.g. the executor batched the events and the wire ordered them
    // out of seq order). The plan_ready merger must not clobber the
    // agentId / subTaskId / status the dispatch handler already set.
    useStreamingTurnStore.getState().start('s1');
    useStreamingTurnStore.getState().ingest('s1', ev('task:start', { input: { id: 'task-merge' } }));
    // Seed a pre-existing step via delegate_dispatched (this requires a
    // step to already exist — but to test merge isolation, use a manual
    // ingest of plan_ready FIRST without agentId, then dispatch overrides).
    useStreamingTurnStore
      .getState()
      .ingest(
        's1',
        ev('workflow:plan_ready', {
          taskId: 'task-merge',
          goal: 'test merge',
          steps: [
            {
              id: 'p-step1',
              description: 'first step',
              strategy: 'delegate-sub-agent',
              dependencies: [],
            },
          ],
          awaitingApproval: false,
        }),
      );
    useStreamingTurnStore
      .getState()
      .ingest(
        's1',
        ev('workflow:delegate_dispatched', {
          taskId: 'task-merge',
          stepId: 'p-step1',
          agentId: 'researcher',
          subTaskId: 'task-merge__sub__r0',
        }),
      );
    // Now plan_ready re-arrives (recovery replay scenario). Dispatch
    // state from before MUST be preserved.
    useStreamingTurnStore
      .getState()
      .ingest(
        's1',
        ev('workflow:plan_ready', {
          taskId: 'task-merge',
          goal: 'test merge',
          steps: [
            {
              id: 'p-step1',
              description: 'first step',
              strategy: 'delegate-sub-agent',
              dependencies: [],
            },
          ],
          awaitingApproval: false,
        }),
      );

    const turn = useStreamingTurnStore.getState().bySession.s1;
    const step = turn?.planSteps.find((s) => s.id === 'p-step1');
    expect(step?.agentId).toBe('researcher');
    expect(step?.subTaskId).toBe('task-merge__sub__r0');
    expect(step?.status).toBe('running');
  });

  test('hydrateRunningTask resets to fresh empty turn when the taskId changes', () => {
    // Only the SAME-task path is preserved; a different taskId means
    // the previous turn is stale (e.g. the user kicked off a new task
    // in the same session) and the empty shell is the right answer.
    useStreamingTurnStore.getState().hydrateRunningTask('s1', 'task-A');
    useStreamingTurnStore.getState().replayInto('s1', 'task-A', [
      { eventType: 'task:start', payload: { input: { id: 'task-A' } }, ts: now },
      {
        eventType: 'workflow:plan_ready',
        payload: { taskId: 'task-A', goal: 'old', steps: [], awaitingApproval: true },
        ts: now + 1,
      },
    ]);
    expect(useStreamingTurnStore.getState().bySession.s1?.status).toBe('awaiting-approval');

    useStreamingTurnStore.getState().hydrateRunningTask('s1', 'task-B');
    const after = useStreamingTurnStore.getState().bySession.s1;
    expect(after?.taskId).toBe('task-B');
    expect(after?.status).toBe('running');
    expect(after?.pendingApproval).toBeUndefined();
  });

  test('replayInto folds persisted events into a recovered turn (stage card restored)', () => {
    // Simulate the bug scenario: browser refresh during a running task,
    // then `useRecoverTurnHistory` fetches the persisted event log.
    useStreamingTurnStore.getState().hydrateRunningTask('s1', 'task-99');
    expect(useStreamingTurnStore.getState().bySession.s1?.currentStageDetail).toBeUndefined();

    useStreamingTurnStore.getState().replayInto('s1', 'task-99', [
      { eventType: 'task:start', payload: { input: { id: 'task-99' } }, ts: now },
      {
        eventType: 'task:stage_update',
        payload: { taskId: 'task-99', phase: 'plan', stage: 'decomposing', status: 'entered' },
        ts: now + 1,
      },
    ]);

    const turn = useStreamingTurnStore.getState().bySession.s1;
    expect(turn?.taskId).toBe('task-99');
    expect(turn?.currentStageDetail?.phase).toBe('plan');
    expect(turn?.currentStageDetail?.stage).toBe('decomposing');
  });

  test('replayInto is a no-op for live (non-recovered) turns', () => {
    // Fresh turn started by `start()` — recovered === undefined. Replaying
    // history into it would clobber live state with stale snapshots.
    useStreamingTurnStore.getState().start('s1');
    useStreamingTurnStore.getState().ingest('s1', ev('task:start', { input: { id: 'task-A' } }));
    const before = useStreamingTurnStore.getState().bySession.s1;

    useStreamingTurnStore.getState().replayInto('s1', 'task-A', [
      {
        eventType: 'task:stage_update',
        payload: { taskId: 'task-A', phase: 'plan', stage: 'decomposing', status: 'entered' },
        ts: now + 1,
      },
    ]);

    const after = useStreamingTurnStore.getState().bySession.s1;
    // Live turn untouched: no stage detail leaked in from replay.
    expect(after?.currentStageDetail).toBeUndefined();
    expect(after).toBe(before);
  });

  test('replayInto is a no-op when taskId mismatches the recovered turn', () => {
    // Race: history fetch returned for an old taskId after /tasks moved
    // on. Applying the stale events would corrupt the new turn.
    useStreamingTurnStore.getState().hydrateRunningTask('s1', 'task-NEW');
    useStreamingTurnStore.getState().replayInto('s1', 'task-OLD', [
      {
        eventType: 'task:stage_update',
        payload: { taskId: 'task-OLD', phase: 'plan', stage: 'decomposing', status: 'entered' },
        ts: now,
      },
    ]);
    const turn = useStreamingTurnStore.getState().bySession.s1;
    expect(turn?.taskId).toBe('task-NEW');
    expect(turn?.currentStageDetail).toBeUndefined();
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

describe('reduceTurn — sub-task event isolation', () => {
  test('task:start with different taskId after parent is set is ignored', () => {
    // When a delegate-sub-agent runs its own core-loop, it emits a
    // task:start with the SUB-task's id. Without isolation this would
    // overwrite turn.taskId and silently re-bind every subsequent guarded
    // reducer to the sub-task, dropping legitimate parent events.
    const t = fold(emptyTurn(), [
      ev('task:start', { input: { id: 'parent-1' }, routing: { level: 2, model: 'sonnet' } }),
      ev('task:start', {
        input: { id: 'parent-1-delegate-step2' },
        routing: { level: 0, model: 'haiku' },
      }),
    ]);
    expect(t.taskId).toBe('parent-1');
    expect(t.engineId).toBe('sonnet');
  });

  test('agent:plan_update from sub-task is ignored', () => {
    // Establish parent task. Then a sub-task's plan_update arrives — must
    // not corrupt the parent plan.
    const seeded = fold(emptyTurn(), [
      ev('task:start', { input: { id: 'parent-1' } }),
      ev('agent:plan_update', {
        taskId: 'parent-1',
        steps: [
          { id: 'p1', label: 'parent step', status: 'running', strategy: 'llm-reasoning' },
        ],
      }),
    ]);
    const after = reduceTurn(
      seeded,
      ev('agent:plan_update', {
        taskId: 'parent-1-delegate-x',
        steps: [
          { id: 'p1', label: 'sub-task step (corrupting!)', status: 'done' },
        ],
      }),
    );
    expect(after.planSteps).toHaveLength(1);
    expect(after.planSteps[0]!.label).toBe('parent step');
    expect(after.planSteps[0]!.status).toBe('running');
  });

  test('workflow:plan_ready from sub-task is ignored (no fake pendingApproval)', () => {
    const seeded = reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'parent-1' } }));
    const after = reduceTurn(
      seeded,
      ev('workflow:plan_ready', {
        taskId: 'parent-1-delegate-x',
        goal: 'sub-task goal',
        steps: [{ id: 's1', description: 'd', strategy: 'llm-reasoning', dependencies: [] }],
        awaitingApproval: true,
      }),
    );
    expect(after.pendingApproval).toBeUndefined();
  });

  test('workflow:delegate_dispatched/completed from sub-task is ignored', () => {
    // Establish parent + delegate plan step. Then a sub-task's delegate
    // events arrive (recursive workflow inside the sub-task).
    const seeded = fold(emptyTurn(), [
      ev('task:start', { input: { id: 'parent-1' } }),
      ev('agent:plan_update', {
        taskId: 'parent-1',
        steps: [
          {
            id: 'step2',
            label: 'researcher',
            status: 'running',
            strategy: 'delegate-sub-agent',
            agentId: 'researcher',
          },
        ],
      }),
      // Pin the sub-task id on step2 from the legitimate parent dispatch.
      ev('workflow:delegate_dispatched', {
        taskId: 'parent-1',
        stepId: 'step2',
        agentId: 'researcher',
        subTaskId: 'parent-1-delegate-step2',
        stepDescription: 'researcher',
      }),
    ]);
    // Now a NESTED delegate dispatched from the sub-task arrives. Same
    // stepId by accident (planner inside sub-task happened to use 'step2'
    // too). Must NOT mutate parent's step2.
    const after = reduceTurn(
      seeded,
      ev('workflow:delegate_dispatched', {
        taskId: 'parent-1-delegate-step2',
        stepId: 'step2',
        agentId: 'philosopher',
        subTaskId: 'parent-1-delegate-step2-delegate-step2',
        stepDescription: 'nested delegate',
      }),
    );
    const step = after.planSteps.find((s) => s.id === 'step2')!;
    expect(step.agentId).toBe('researcher');
    expect(step.subTaskId).toBe('parent-1-delegate-step2');
    // Same for delegate_completed.
    const after2 = reduceTurn(
      after,
      ev('workflow:delegate_completed', {
        taskId: 'parent-1-delegate-step2',
        stepId: 'step2',
        agentId: 'philosopher',
        status: 'completed',
        outputPreview: 'nested fake',
      }),
    );
    const step2 = after2.planSteps.find((s) => s.id === 'step2')!;
    expect(step2.outputPreview).toBeUndefined();
    expect(step2.status).toBe('running');
  });

  test('llm:stream_delta from sub-task routes to matching delegate step by subTaskId', () => {
    // Two delegates both running. Sub-task A's content delta should land
    // in step3's stepOutputs, sub-task B's in step4's — without the
    // subTaskId routing they'd both pile into "first running step".
    const seeded = fold(emptyTurn(), [
      ev('task:start', { input: { id: 'parent-1' } }),
      ev('agent:plan_update', {
        taskId: 'parent-1',
        steps: [
          {
            id: 'step3',
            label: 'researcher',
            status: 'running',
            strategy: 'delegate-sub-agent',
            agentId: 'researcher',
          },
          {
            id: 'step4',
            label: 'author',
            status: 'running',
            strategy: 'delegate-sub-agent',
            agentId: 'author',
          },
        ],
      }),
      ev('workflow:delegate_dispatched', {
        taskId: 'parent-1',
        stepId: 'step3',
        agentId: 'researcher',
        subTaskId: 'parent-1-delegate-step3',
        stepDescription: 'researcher',
      }),
      ev('workflow:delegate_dispatched', {
        taskId: 'parent-1',
        stepId: 'step4',
        agentId: 'author',
        subTaskId: 'parent-1-delegate-step4',
        stepDescription: 'author',
      }),
    ]);
    // Researcher streams its answer.
    const t1 = reduceTurn(
      seeded,
      ev('llm:stream_delta', {
        taskId: 'parent-1-delegate-step3',
        kind: 'content',
        text: 'researcher: empirical findings.',
      }),
    );
    // Author streams its answer concurrently.
    const t2 = reduceTurn(
      t1,
      ev('llm:stream_delta', {
        taskId: 'parent-1-delegate-step4',
        kind: 'content',
        text: 'author: a story unfolds.',
      }),
    );
    expect(t2.stepOutputs.step3).toBe('researcher: empirical findings.');
    expect(t2.stepOutputs.step4).toBe('author: a story unfolds.');
    // No content leaked into finalContent.
    expect(t2.finalContent).toBe('');
  });

  test('llm:stream_delta from unknown sub-task is dropped (not sprayed into running step)', () => {
    const seeded = fold(emptyTurn(), [
      ev('task:start', { input: { id: 'parent-1' } }),
      ev('agent:plan_update', {
        taskId: 'parent-1',
        steps: [
          {
            id: 'step1',
            label: 'researcher',
            status: 'running',
            strategy: 'delegate-sub-agent',
            agentId: 'researcher',
          },
        ],
      }),
    ]);
    // No delegate_dispatched yet → no subTaskId mapping. An sub-task
    // delta arrives. Drop it instead of corrupting step1's content.
    const after = reduceTurn(
      seeded,
      ev('llm:stream_delta', {
        taskId: 'parent-1-delegate-stepZ',
        kind: 'content',
        text: 'leaking',
      }),
    );
    expect(after.stepOutputs.step1).toBeUndefined();
    expect(after.finalContent).toBe('');
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

describe('reduceTurn — sub-task tool attribution (compact step history)', () => {
  // The agent-timeline-card drawer renders each delegate's "step history"
  // (Read X / Fetched Y / Searched Z) by filtering `turn.toolCalls` on
  // `planStepId`. For that to work the reducer must pin tool events from
  // a sub-task's own LLM run to the right delegate step — NOT to whichever
  // parent step `currentRunningStepId` happened to find first. These tests
  // lock in the `subTaskIdIndex`-based attribution that powers the redesign.

  function seedThreeDelegates() {
    return fold(
      reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'parent-1' } })),
      [
        ev('agent:plan_update', {
          taskId: 'parent-1',
          steps: [
            {
              id: 's-researcher',
              label: 'Researcher answers',
              status: 'pending',
              strategy: 'delegate-sub-agent',
              agentId: 'researcher',
            },
            {
              id: 's-author',
              label: 'Author answers',
              status: 'pending',
              strategy: 'delegate-sub-agent',
              agentId: 'author',
            },
            {
              id: 's-mentor',
              label: 'Mentor answers',
              status: 'pending',
              strategy: 'delegate-sub-agent',
              agentId: 'mentor',
            },
          ],
        }),
        ev('workflow:delegate_dispatched', {
          taskId: 'parent-1',
          stepId: 's-researcher',
          agentId: 'researcher',
          subTaskId: 'sub-r',
          stepDescription: '...',
        }),
        ev('workflow:delegate_dispatched', {
          taskId: 'parent-1',
          stepId: 's-author',
          agentId: 'author',
          subTaskId: 'sub-a',
          stepDescription: '...',
        }),
        ev('workflow:delegate_dispatched', {
          taskId: 'parent-1',
          stepId: 's-mentor',
          agentId: 'mentor',
          subTaskId: 'sub-m',
          stepDescription: '...',
        }),
      ],
    );
  }

  test('agent:tool_started from sub-task pins planStepId via subTaskIdIndex', () => {
    const seeded = seedThreeDelegates();
    const after = reduceTurn(
      seeded,
      ev('agent:tool_started', {
        taskId: 'sub-r',
        toolCallId: 'call-1',
        toolName: 'web_fetch',
        args: { url: 'https://example.com' },
      }),
    );
    const tool = after.toolCalls.find((t) => t.id === 'call-1')!;
    expect(tool.planStepId).toBe('s-researcher');
    expect(tool.name).toBe('web_fetch');
    // attachToolToStep also threads it onto the step's toolCallIds.
    const step = after.planSteps.find((s) => s.id === 's-researcher')!;
    expect(step.toolCallIds).toContain('call-1');
  });

  test('parallel delegates each get their own tool calls (no cross-attribution)', () => {
    // Image 2 case: 3 delegates running in parallel. Without subTaskId
    // resolution, all of their tools would land on whichever delegate
    // was first in `planSteps` (because all three are status=running and
    // currentRunningStepId returns the first match) — collapsing each
    // persona's history into one row.
    const seeded = seedThreeDelegates();
    const after = fold(seeded, [
      ev('agent:tool_started', {
        taskId: 'sub-r',
        toolCallId: 'r1',
        toolName: 'web_fetch',
        args: { url: 'a' },
      }),
      ev('agent:tool_started', {
        taskId: 'sub-a',
        toolCallId: 'a1',
        toolName: 'read_file',
        args: { path: 'x.ts' },
      }),
      ev('agent:tool_started', {
        taskId: 'sub-m',
        toolCallId: 'm1',
        toolName: 'grep_search',
        args: { query: 'foo' },
      }),
    ]);
    const byStep = new Map(
      after.planSteps.map((s) => [
        s.id,
        after.toolCalls.filter((t) => t.planStepId === s.id).map((t) => t.id),
      ]),
    );
    expect(byStep.get('s-researcher')).toEqual(['r1']);
    expect(byStep.get('s-author')).toEqual(['a1']);
    expect(byStep.get('s-mentor')).toEqual(['m1']);
  });

  test('agent:tool_executed updates the matching tool_started entry without losing planStepId', () => {
    const seeded = seedThreeDelegates();
    const after = fold(seeded, [
      ev('agent:tool_started', {
        taskId: 'sub-a',
        toolCallId: 'a1',
        toolName: 'read_file',
        args: { path: 'x.ts' },
      }),
      ev('agent:tool_executed', {
        taskId: 'sub-a',
        toolCallId: 'a1',
        toolName: 'read_file',
        durationMs: 137,
        isError: false,
      }),
    ]);
    const tool = after.toolCalls.find((t) => t.id === 'a1')!;
    expect(tool.status).toBe('success');
    expect(tool.durationMs).toBe(137);
    expect(tool.planStepId).toBe('s-author');
  });

  test('agent:tool_executed without prior tool_started synthesizes entry pinned via sub-task', () => {
    // Dropped/missed `tool_started` (e.g. legacy backend, replay edge): the
    // executed event must still attach to the right delegate, otherwise the
    // step history loses entries silently.
    const seeded = seedThreeDelegates();
    const after = reduceTurn(
      seeded,
      ev('agent:tool_executed', {
        taskId: 'sub-m',
        toolCallId: 'm-orphan',
        toolName: 'web_fetch',
        durationMs: 42,
        isError: false,
        args: { url: 'https://x' },
      }),
    );
    const tool = after.toolCalls.find((t) => t.id === 'm-orphan')!;
    expect(tool.planStepId).toBe('s-mentor');
    expect(tool.status).toBe('success');
  });

  test('partial_failure_decision_needed sets pendingPartialDecision + status awaiting-human-input', () => {
    const turn = reduceTurn(
      reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'task-pf' } })),
      ev('workflow:partial_failure_decision_needed', {
        taskId: 'task-pf',
        failedStepIds: ['step2'],
        skippedStepIds: ['step4'],
        completedStepIds: ['step1', 'step3'],
        summary: '1 of 4 steps failed; 1 dependent step skipped.',
        partialPreview: '**researcher**: hello\n\n**mentor**: world',
        timeoutMs: 180_000,
      }),
    );
    expect(turn.status).toBe('awaiting-human-input');
    expect(turn.pendingPartialDecision).toBeDefined();
    expect(turn.pendingPartialDecision!.failedStepIds).toEqual(['step2']);
    expect(turn.pendingPartialDecision!.skippedStepIds).toEqual(['step4']);
    expect(turn.pendingPartialDecision!.completedStepIds).toEqual(['step1', 'step3']);
    expect(turn.pendingPartialDecision!.timeoutMs).toBe(180_000);
    expect(turn.pendingPartialDecision!.partialPreview).toContain('researcher');
  });

  test('partial_failure_decision_provided clears pendingPartialDecision and resumes running', () => {
    const after = fold(
      reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'task-pf' } })),
      [
        ev('workflow:partial_failure_decision_needed', {
          taskId: 'task-pf',
          failedStepIds: ['step2'],
          skippedStepIds: ['step4'],
          completedStepIds: ['step1'],
          summary: 'x',
          timeoutMs: 60_000,
        }),
        ev('workflow:partial_failure_decision_provided', {
          taskId: 'task-pf',
          decision: 'continue',
        }),
      ],
    );
    expect(after.pendingPartialDecision).toBeUndefined();
    expect(after.status).toBe('running');
  });

  test('partial_failure_decision_needed from a sub-task is ignored', () => {
    // Backend already bypasses the gate for sub-tasks, but the reducer is
    // a defense-in-depth — never let a stray sub-task event hijack the
    // parent's UI surface.
    const seeded = reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'parent-1' } }));
    const after = reduceTurn(
      seeded,
      ev('workflow:partial_failure_decision_needed', {
        taskId: 'sub-task-1', // different from parent
        failedStepIds: ['step2'],
        skippedStepIds: ['step4'],
        completedStepIds: [],
        summary: 'leak',
        timeoutMs: 60_000,
      }),
    );
    expect(after.pendingPartialDecision).toBeUndefined();
    expect(after.status).toBe(seeded.status);
  });

  test('task:complete clears pendingPartialDecision (terminal teardown)', () => {
    const after = fold(
      reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'task-pf' } })),
      [
        ev('workflow:partial_failure_decision_needed', {
          taskId: 'task-pf',
          failedStepIds: ['step2'],
          skippedStepIds: ['step4'],
          completedStepIds: [],
          summary: 'x',
          timeoutMs: 60_000,
        }),
        ev('task:complete', {
          result: { id: 'task-pf', status: 'partial', content: 'partial answer' },
        }),
      ],
    );
    expect(after.pendingPartialDecision).toBeUndefined();
    expect(after.status).toBe('done');
    expect(after.resultStatus).toBe('partial');
  });

  test('tool event with unknown taskId falls back to currentRunningStepId', () => {
    // Non-delegate workflow paths (e.g. an in-process llm-reasoning step
    // running its own tool) don't carry a sub-task id. They must still
    // attribute via the current-running-step heuristic.
    const seeded = fold(
      reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'parent-1' } })),
      [
        ev('agent:plan_update', {
          taskId: 'parent-1',
          steps: [
            {
              id: 'lr',
              label: 'Reason about input',
              status: 'running',
              strategy: 'llm-reasoning',
            },
          ],
        }),
        ev('agent:tool_started', {
          taskId: 'parent-1',
          toolCallId: 'lr-1',
          toolName: 'shell',
          args: { command: 'ls' },
        }),
      ],
    );
    const tool = seeded.toolCalls.find((t) => t.id === 'lr-1')!;
    expect(tool.planStepId).toBe('lr');
  });
});

describe('reduceTurn — stage manifest', () => {
  test('workflow:decision_recorded captures the post-prompt decision', () => {
    const t = reduceTurn(
      reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'task-1' } })),
      ev('workflow:decision_recorded', {
        taskId: 'task-1',
        sessionId: 'sess-1',
        decision: {
          taskId: 'task-1',
          sessionId: 'sess-1',
          userPrompt: 'แบ่ง agent 3 ตัว แข่งกัน',
          decisionKind: 'multi-agent',
          decisionRationale: 'planner picked multi-agent',
          createdAt: 1_700_000_000,
          routingLevel: 2,
        },
      }),
    );
    expect(t.decisionStage?.decisionKind).toBe('multi-agent');
    expect(t.decisionStage?.userPrompt).toContain('agent 3');
    expect(t.decisionStage?.routingLevel).toBe(2);
  });

  test('workflow:todo_created populates todoList; todo_updated flips status + failure reason', () => {
    const seeded = reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'task-1' } }));
    const created = reduceTurn(
      seeded,
      ev('workflow:todo_created', {
        taskId: 'task-1',
        groupMode: 'competition',
        todoList: [
          {
            id: 'todo-step1',
            title: 'Pick a topic',
            ownerType: 'system',
            status: 'pending',
            dependsOn: [],
            sourceStepId: 'step1',
          },
          {
            id: 'todo-step2',
            title: 'Answer',
            ownerType: 'agent',
            ownerId: 'developer',
            status: 'pending',
            dependsOn: ['step1'],
            sourceStepId: 'step2',
          },
        ],
      }),
    );
    expect(created.todoList).toHaveLength(2);
    expect(created.multiAgentGroupMode).toBe('competition');

    const updated = reduceTurn(
      created,
      ev('workflow:todo_updated', {
        taskId: 'task-1',
        todoId: 'todo-step2',
        status: 'failed',
        failureReason: 'provider quota exhausted',
      }),
    );
    const todo = updated.todoList.find((t) => t.id === 'todo-step2')!;
    expect(todo.status).toBe('failed');
    expect(todo.failureReason).toBe('provider quota exhausted');
  });

  test('workflow:subtasks_planned + subtask_updated track multi-agent state with deterministic labels', () => {
    const seeded = reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'parent-1' } }));
    const planned = reduceTurn(
      seeded,
      ev('workflow:subtasks_planned', {
        taskId: 'parent-1',
        groupMode: 'competition',
        subtasks: [
          {
            subtaskId: 'parent-1-delegate-s1',
            parentTaskId: 'parent-1',
            stepId: 's1',
            fallbackLabel: 'Agent 1',
            title: 'Answer',
            objective: 'Answer question 1',
            prompt: 'Answer question 1',
            inputRefs: [],
            status: 'planned',
          },
          {
            subtaskId: 'parent-1-delegate-s2',
            parentTaskId: 'parent-1',
            stepId: 's2',
            fallbackLabel: 'Agent 2',
            title: 'Answer',
            objective: 'Answer question 1',
            prompt: 'Answer question 1',
            inputRefs: [],
            status: 'planned',
            agentId: 'developer',
            agentName: 'Developer',
          },
        ],
      }),
    );
    expect(planned.multiAgentSubtasks).toHaveLength(2);
    expect(planned.multiAgentSubtasks[0]!.fallbackLabel).toBe('Agent 1');
    expect(planned.multiAgentSubtasks[1]!.agentName).toBe('Developer');
    expect(planned.multiAgentGroupMode).toBe('competition');

    const running = reduceTurn(
      planned,
      ev('workflow:subtask_updated', {
        taskId: 'parent-1',
        subtaskId: 'parent-1-delegate-s1',
        stepId: 's1',
        status: 'running',
        agentId: 'researcher',
      }),
    );
    expect(running.multiAgentSubtasks[0]!.status).toBe('running');
    expect(running.multiAgentSubtasks[0]!.agentId).toBe('researcher');

    const failed = reduceTurn(
      running,
      ev('workflow:subtask_updated', {
        taskId: 'parent-1',
        subtaskId: 'parent-1-delegate-s2',
        stepId: 's2',
        status: 'failed',
        errorKind: 'timeout',
        errorMessage: 'idle timeout after 180s',
      }),
    );
    expect(failed.multiAgentSubtasks[1]!.status).toBe('failed');
    expect(failed.multiAgentSubtasks[1]!.errorKind).toBe('timeout');
    expect(failed.multiAgentSubtasks[1]!.errorMessage).toContain('180s');
  });

  test('subtask_updated monotonic guard: late running cannot revert a terminal subtask', () => {
    // Concrete repro: parent task `1b74654b-fad9-4e98-8cfc-4662916b50e6`
    // (2026-05-03) emitted task:complete + sweep at the synthesizer step,
    // then a recursive sub-task's late watchdog fired
    // `subtask_updated{status:'running'}` — the agent timeline card flipped
    // back to a spinner even though the bubble header already read "Done"
    // ("1 working 6 done" alongside "✓ Done"). Without this monotonic
    // guard the user sees two contradictory truths in one card.
    const seeded = reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'parent-1' } }));
    const planned = reduceTurn(
      seeded,
      ev('workflow:subtasks_planned', {
        taskId: 'parent-1',
        groupMode: 'competition',
        subtasks: [
          {
            subtaskId: 'parent-1-delegate-s1',
            parentTaskId: 'parent-1',
            stepId: 's1',
            fallbackLabel: 'Agent 1',
            title: 'Answer',
            objective: 'Answer question',
            prompt: 'Answer question',
            inputRefs: [],
            status: 'planned',
          },
        ],
      }),
    );
    const done = reduceTurn(
      planned,
      ev('workflow:subtask_updated', {
        taskId: 'parent-1',
        subtaskId: 'parent-1-delegate-s1',
        stepId: 's1',
        status: 'done',
        outputPreview: 'final answer',
      }),
    );
    expect(done.multiAgentSubtasks[0]!.status).toBe('done');
    // Late "running" arrives after the subtask was already terminal.
    const reverted = reduceTurn(
      done,
      ev('workflow:subtask_updated', {
        taskId: 'parent-1',
        subtaskId: 'parent-1-delegate-s1',
        stepId: 's1',
        status: 'running',
        agentId: 'researcher',
      }),
    );
    // Status holds at terminal — no spinner regression.
    expect(reverted.multiAgentSubtasks[0]!.status).toBe('done');
    // Other fields (agentId in this case) DO still patch through. Only
    // the lifecycle phase is held; metadata catch-up snapshots remain
    // applied so the card can still reveal the resolved persona id.
    expect(reverted.multiAgentSubtasks[0]!.agentId).toBe('researcher');
    expect(reverted.multiAgentSubtasks[0]!.outputPreview).toBe('final answer');
  });

  test('subtask_updated monotonic guard: terminal-to-terminal transitions are still applied', () => {
    // Regression guard: the monotonic check must only block terminal →
    // non-terminal. A task that lands `done` then later corrected to
    // `failed` (e.g. a late oracle verdict overrides the optimistic
    // success) MUST flip to failed; otherwise the UI would lie about a
    // successful outcome that was post-hoc invalidated.
    const seeded = reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'parent-1' } }));
    const planned = reduceTurn(
      seeded,
      ev('workflow:subtasks_planned', {
        taskId: 'parent-1',
        subtasks: [
          {
            subtaskId: 'parent-1-delegate-s1',
            parentTaskId: 'parent-1',
            stepId: 's1',
            fallbackLabel: 'Agent 1',
            title: 'Answer',
            objective: 'q',
            prompt: 'q',
            inputRefs: [],
            status: 'planned',
          },
        ],
      }),
    );
    const done = reduceTurn(
      planned,
      ev('workflow:subtask_updated', {
        taskId: 'parent-1',
        subtaskId: 'parent-1-delegate-s1',
        stepId: 's1',
        status: 'done',
      }),
    );
    const corrected = reduceTurn(
      done,
      ev('workflow:subtask_updated', {
        taskId: 'parent-1',
        subtaskId: 'parent-1-delegate-s1',
        stepId: 's1',
        status: 'failed',
        errorKind: 'contract_violation',
      }),
    );
    expect(corrected.multiAgentSubtasks[0]!.status).toBe('failed');
    expect(corrected.multiAgentSubtasks[0]!.errorKind).toBe('contract_violation');
  });

  test('stage events from a delegated sub-task are ignored on the parent turn', () => {
    const parent = reduceTurn(emptyTurn(), ev('task:start', { input: { id: 'parent-1' } }));
    const t = reduceTurn(
      parent,
      ev('workflow:decision_recorded', {
        taskId: 'sub-task-99', // different id
        decision: {
          taskId: 'sub-task-99',
          userPrompt: 'inner',
          decisionKind: 'single-agent',
          createdAt: 0,
        },
      }),
    );
    expect(t.decisionStage).toBeUndefined();
  });

  test('replay through reduceTurn produces the same manifest state as live emission', () => {
    // Persisted-event replay must converge with live SSE — same reducer,
    // so feeding the same payloads in the same order yields the same shape.
    const events = [
      ev('task:start', { input: { id: 'task-1' } }),
      ev('workflow:decision_recorded', {
        taskId: 'task-1',
        decision: {
          taskId: 'task-1',
          userPrompt: 'g',
          decisionKind: 'multi-agent',
          createdAt: 0,
        },
      }),
      ev('workflow:todo_created', {
        taskId: 'task-1',
        todoList: [
          {
            id: 'todo-s1',
            title: 'A',
            ownerType: 'system',
            status: 'pending',
            dependsOn: [],
            sourceStepId: 's1',
          },
        ],
      }),
      ev('workflow:subtasks_planned', {
        taskId: 'task-1',
        subtasks: [
          {
            subtaskId: 'task-1-delegate-d1',
            parentTaskId: 'task-1',
            stepId: 'd1',
            fallbackLabel: 'Agent 1',
            title: 'Answer',
            objective: 'x',
            prompt: 'x',
            inputRefs: [],
            status: 'planned',
          },
        ],
      }),
    ];
    const live = fold(emptyTurn(), events);
    const replayed = fold(emptyTurn(), [...events]); // re-run same sequence
    expect(replayed.decisionStage).toEqual(live.decisionStage);
    expect(replayed.todoList).toEqual(live.todoList);
    expect(replayed.multiAgentSubtasks).toEqual(live.multiAgentSubtasks);
  });
});
