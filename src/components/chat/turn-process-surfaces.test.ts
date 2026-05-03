/**
 * Replay parity tests for the historical/live shared surface composition.
 *
 * These tests intentionally stay at the *data* level (replay → reduced turn
 * → policy) rather than mounting React, so they run under bun:test without
 * a DOM. The acceptance criteria they enforce:
 *
 *   - replayProcessLog of a multi-agent run produces a turn whose policy
 *     enables StageManifest, AgentTimeline, PlanSurface, FinalAnswer
 *   - the manifest carries fallbackLabel / agentName for every delegate so
 *     AgentTimelineCard's `resolveAgentLabel` never falls back to "agent?"
 *   - failed delegates surface errorKind + errorMessage on the manifest
 *   - a log without `task:complete` is classified `missing-terminal` —
 *     historical mode does NOT silently mutate running steps to done
 *   - a log paused on a workflow gate is classified `awaiting-user`
 */
import { describe, expect, test } from 'bun:test';
import { replayProcessLog, type PersistedTaskEvent } from '@/lib/replay-process-log';
import { replayCompleteness } from '@/lib/replay-completeness';
import { buildTurnSurfaceRenderPolicy } from '@/lib/turn-surface-policy';

let seq = 0;
let now = 1_700_000_000_000;
function persisted(eventType: string, payload: Record<string, unknown> = {}): PersistedTaskEvent {
  seq += 1;
  now += 5;
  return {
    id: `e-${seq}`,
    taskId: 't-multi',
    seq,
    eventType,
    payload: { taskId: 't-multi', ...payload },
    ts: now,
  };
}

function resetSeq() {
  seq = 0;
  now = 1_700_000_000_000;
}

describe('historical replay parity — multi-agent run', () => {
  test('replayed multi-agent run enables all major surfaces and uses fallback labels', () => {
    resetSeq();
    const events: PersistedTaskEvent[] = [
      persisted('task:start', { input: { id: 't-multi' } }),
      persisted('workflow:decision_recorded', {
        decision: {
          decisionKind: 'multi-agent',
          userPrompt: 'race three agents',
          createdAt: now,
        },
      }),
      persisted('agent:plan_update', {
        steps: [
          { id: 's-q', label: 'Generate question', status: 'done', strategy: 'llm-reasoning' },
          { id: 's-d1', label: 'Answer the question', status: 'done', strategy: 'delegate-sub-agent' },
          { id: 's-d2', label: 'Answer the question', status: 'done', strategy: 'delegate-sub-agent' },
          { id: 's-d3', label: 'Answer the question', status: 'failed', strategy: 'delegate-sub-agent' },
          { id: 's-syn', label: 'Compare answers', status: 'done', strategy: 'llm-reasoning' },
        ],
      }),
      persisted('workflow:subtasks_planned', {
        groupMode: 'competition',
        subtasks: [
          {
            subtaskId: 'st-1',
            stepId: 's-d1',
            fallbackLabel: 'Agent 1',
            agentName: 'researcher',
            agentRole: 'analyst',
            title: 'A',
            objective: 'Compose a balanced answer',
            prompt: 'You are agent 1, answer the question…',
            inputRefs: ['s-q.result'],
            expectedOutput: 'A 2-paragraph answer in markdown',
            status: 'planned',
            capabilityTags: ['writing', 'analysis'],
          },
          {
            subtaskId: 'st-2',
            stepId: 's-d2',
            fallbackLabel: 'Agent 2',
            agentName: 'mentor',
            title: 'B',
            objective: 'Compose a balanced answer',
            prompt: 'You are agent 2, answer the question…',
            inputRefs: ['s-q.result'],
            status: 'planned',
          },
          {
            subtaskId: 'st-3',
            stepId: 's-d3',
            fallbackLabel: 'Agent 3',
            title: 'C',
            objective: 'Compose a balanced answer',
            prompt: 'You are agent 3…',
            inputRefs: ['s-q.result'],
            status: 'planned',
          },
        ],
      }),
      persisted('workflow:subtask_updated', {
        subtaskId: 'st-1',
        status: 'done',
        outputPreview: 'agent 1 answer',
      }),
      persisted('workflow:subtask_updated', {
        subtaskId: 'st-2',
        status: 'done',
        outputPreview: 'agent 2 answer',
      }),
      persisted('workflow:subtask_updated', {
        subtaskId: 'st-3',
        status: 'failed',
        errorKind: 'timeout',
        errorMessage: 'agent 3 timed out after 30s',
      }),
      persisted('task:complete', {
        result: { id: 't-multi', status: 'partial', content: 'comparison table' },
      }),
    ];

    const turn = replayProcessLog(events, { taskId: 't-multi' });
    const policy = buildTurnSurfaceRenderPolicy(turn, 'historical');

    // Surface visibility — for delegate flows decision metadata folds into
    // AgentRosterCard's header. FinalAnswer is suppressed in historical
    // mode because MessageBubble already renders `message.content` outside
    // of TurnProcessSurfaces — leaving it on would duplicate the same
    // markdown twice in one bubble.
    expect(policy.agentTimelineOwnsDecisionMeta).toBe(true);
    expect(policy.showAgentTimeline).toBe(true);
    expect(policy.showPlanSurface).toBe(true);
    expect(policy.showFinalAnswer).toBe(false);
    expect(policy.suppressDelegateOutputsInPlan).toBe(true);

    // Live mode of the same reduced turn keeps FinalAnswer on — that's where
    // the streaming caret lives and where there is no MessageBubble sibling
    // rendering the markdown for us.
    const livePolicy = buildTurnSurfaceRenderPolicy(turn, 'live');
    expect(livePolicy.showFinalAnswer).toBe(true);

    // Stage manifest decision is preserved
    expect(turn.decisionStage?.decisionKind).toBe('multi-agent');
    expect(turn.multiAgentGroupMode).toBe('competition');

    // Every delegate has a label resolvable without "agent?"
    expect(turn.multiAgentSubtasks).toHaveLength(3);
    for (const st of turn.multiAgentSubtasks) {
      const label = st.agentName ?? st.agentId ?? st.fallbackLabel;
      expect(label).toBeTruthy();
      expect(label).not.toBe('agent?');
    }

    // Failed delegate carries structured error fields the AgentTimelineCard
    // uses for the failure block.
    const failed = turn.multiAgentSubtasks.find((s) => s.subtaskId === 'st-3')!;
    expect(failed.status).toBe('failed');
    expect(failed.errorKind).toBe('timeout');
    expect(failed.errorMessage).toBe('agent 3 timed out after 30s');

    // Manifest detail panel sources (objective / prompt / expectedOutput /
    // inputRefs / capabilityTags) preserved across replay.
    const first = turn.multiAgentSubtasks.find((s) => s.subtaskId === 'st-1')!;
    expect(first.objective).toContain('balanced');
    expect(first.expectedOutput).toContain('markdown');
    expect(first.inputRefs).toEqual(['s-q.result']);
    expect(first.capabilityTags).toEqual(['writing', 'analysis']);

    // Reducer settled cleanly to done — the historical card does NOT need
    // to coerce status; the persisted log carried `task:complete`.
    expect(turn.status).toBe('done');
    expect(turn.finalContent).toBe('comparison table');
  });
});

describe('historical replay parity — multi-agent run with descendant child rows', () => {
  // Anchor for the historical Process Replay bug: completed multi-agent
  // runs collapsed every delegate row to the "Reasoning-only" path because
  // the replay adapter passed `payload` AS-IS, and the reducer's
  // `resolveStepId` reads `payload.taskId` to route delegate child events
  // via `subTaskIdIndex`. Persisted rows always carry the row-level taskId
  // (it's how the descendants endpoint joins by session and merges by ts),
  // but the inner payload may not always echo it. The replay adapter must
  // backfill `payload.taskId` from the row-level `taskId` so live and
  // historical paths share the same routing invariant.
  //
  // The scenario is intentionally PARALLEL: both delegates are dispatched
  // before either completes, and their child events interleave. Without
  // payload-level taskId, `resolveStepId` falls through to
  // `currentRunningStepId` which returns the first running step — every
  // C2 event collapses onto C1's plan step. This matches the screenshot
  // where competition-mode (parallel) sub-agents replay with all 4 rows
  // empty.

  function buildEvents(opts: { withPayloadTaskId: boolean }): PersistedTaskEvent[] {
    let s = 0;
    let t = 1_700_000_000_000;
    const C1 = 't-multi-c1';
    const C2 = 't-multi-c2';
    function row(taskId: string, eventType: string, payload: Record<string, unknown>): PersistedTaskEvent {
      s += 1;
      t += 5;
      return { id: `e-${s}`, taskId, seq: s, eventType, payload, ts: t };
    }
    function childPayload(childTaskId: string, base: Record<string, unknown>): Record<string, unknown> {
      // When `withPayloadTaskId` is false, the row-level taskId is the
      // only attribution — exactly what the recorder writes when it
      // backfilled `task_id` from `input.id` / `result.id` rather than a
      // top-level `payload.taskId`.
      return opts.withPayloadTaskId ? { taskId: childTaskId, ...base } : base;
    }

    return [
      row('t-multi', 'task:start', { input: { id: 't-multi' } }),
      row('t-multi', 'agent:plan_update', {
        taskId: 't-multi',
        steps: [
          { id: 's-d1', label: 'Researcher', status: 'pending', strategy: 'delegate-sub-agent' },
          { id: 's-d2', label: 'Author', status: 'pending', strategy: 'delegate-sub-agent' },
          { id: 's-syn', label: 'Synthesize', status: 'pending', strategy: 'llm-reasoning' },
        ],
      }),
      row('t-multi', 'workflow:subtasks_planned', {
        taskId: 't-multi',
        groupMode: 'competition',
        subtasks: [
          { subtaskId: 'st-1', stepId: 's-d1', fallbackLabel: 'Agent 1', agentName: 'researcher', objective: 'research', prompt: '...', inputRefs: [] },
          { subtaskId: 'st-2', stepId: 's-d2', fallbackLabel: 'Agent 2', agentName: 'author', objective: 'write', prompt: '...', inputRefs: [] },
        ],
      }),
      // Both delegates dispatched (both running before any completes).
      row('t-multi', 'workflow:delegate_dispatched', {
        taskId: 't-multi', stepId: 's-d1', subTaskId: C1, agentId: 'researcher',
      }),
      row('t-multi', 'workflow:delegate_dispatched', {
        taskId: 't-multi', stepId: 's-d2', subTaskId: C2, agentId: 'author',
      }),
      // Interleaved tool + stream events from both children. The order
      // is intentionally NOT sorted by child so currentRunningStepId
      // would mis-attribute every C2 event to s-d1 (the first running
      // step).
      row(C1, 'agent:tool_started', childPayload(C1, { turnId: 'turn-r-1', toolCallId: 'tc-r-1', toolName: 'Read' })),
      row(C2, 'agent:tool_started', childPayload(C2, { turnId: 'turn-a-1', toolCallId: 'tc-a-1', toolName: 'Grep' })),
      row(C1, 'llm:stream_delta', childPayload(C1, { turnId: 'turn-r-1', kind: 'content', text: 'RESEARCHER_STREAM_BODY' })),
      row(C2, 'llm:stream_delta', childPayload(C2, { turnId: 'turn-a-1', kind: 'content', text: 'AUTHOR_STREAM_BODY' })),
      row(C1, 'agent:tool_executed', childPayload(C1, { turnId: 'turn-r-1', toolCallId: 'tc-r-1', toolName: 'Read', durationMs: 12, isError: false })),
      row(C2, 'agent:tool_executed', childPayload(C2, { turnId: 'turn-a-1', toolCallId: 'tc-a-1', toolName: 'Grep', durationMs: 8, isError: false })),
      // Completions (in arrival order).
      row('t-multi', 'workflow:delegate_completed', {
        taskId: 't-multi', stepId: 's-d1', subTaskId: C1, agentId: 'researcher',
        status: 'completed', outputPreview: 'researcher answer preview',
      }),
      row('t-multi', 'workflow:subtask_updated', {
        taskId: 't-multi', subtaskId: 'st-1', status: 'done', outputPreview: 'researcher answer preview',
      }),
      row('t-multi', 'workflow:delegate_completed', {
        taskId: 't-multi', stepId: 's-d2', subTaskId: C2, agentId: 'author',
        status: 'completed', outputPreview: 'author answer preview',
      }),
      row('t-multi', 'workflow:subtask_updated', {
        taskId: 't-multi', subtaskId: 'st-2', status: 'done', outputPreview: 'author answer preview',
      }),
      // Terminal — payload has no top-level taskId (matches real shape).
      row('t-multi', 'task:complete', { result: { id: 't-multi', status: 'completed', content: 'final synthesis' } }),
    ];
  }

  function assertDelegateAttribution(turn: ReturnType<typeof replayProcessLog>) {
    // 1) subTaskIdIndex round-trip: every dispatch event populated the
    //    index with the right child taskId → step id.
    expect(turn.subTaskIdIndex['t-multi-c1']).toBe('s-d1');
    expect(turn.subTaskIdIndex['t-multi-c2']).toBe('s-d2');

    // 2) Each delegate's tool calls land on ITS plan step — not collapsed
    //    onto whichever delegate happened to be running first. This is the
    //    smoking-gun assertion for the parallel-multi-agent bug.
    const readCall = turn.toolCalls.find((c) => c.name === 'Read');
    const grepCall = turn.toolCalls.find((c) => c.name === 'Grep');
    expect(readCall?.planStepId).toBe('s-d1');
    expect(grepCall?.planStepId).toBe('s-d2');

    // 3) Each delegate plan step has BOTH a non-empty toolCallIds list
    //    (so `agent-timeline-card`'s `eventsByStep.get(step.id)` is
    //    non-empty) AND an outputPreview from delegate_completed. The
    //    "Reasoning-only" predicate `!hasEvents && !hasFinalOutput` must
    //    therefore be FALSE for every delegate row.
    const sd1 = turn.planSteps.find((s) => s.id === 's-d1')!;
    const sd2 = turn.planSteps.find((s) => s.id === 's-d2')!;
    expect(sd1.toolCallIds.length).toBe(1);
    expect(sd2.toolCallIds.length).toBe(1);
    expect(sd1.outputPreview).toContain('researcher');
    expect(sd2.outputPreview).toContain('author');

    // 4) Streamed delegate content does NOT escape upward into the
    //    parent's `finalContent` (which would corrupt the synthesizer
    //    output and surface "RESEARCHER_STREAM_BODY" as the user-facing
    //    answer). When the routing invariant fails AND payload taskId is
    //    missing, the deltas would otherwise drain into finalContent via
    //    the `else` branch of `appendContentDelta`.
    expect(turn.finalContent).not.toContain('RESEARCHER_STREAM_BODY');
    expect(turn.finalContent).not.toContain('AUTHOR_STREAM_BODY');
  }

  test('child events with payload.taskId route correctly to their delegate plan step', () => {
    const events = buildEvents({ withPayloadTaskId: true });
    const turn = replayProcessLog(events, { taskId: 't-multi' });
    assertDelegateAttribution(turn);
  });

  test('child events whose row.taskId is set but payload.taskId is missing still route via row-level attribution', () => {
    // The recorder writes the persisted row's `task_id` column from
    // `extractIds`, which falls back to `input.id` / `result.id` when
    // payload omits `taskId`. The descendants endpoint returns the
    // row-level taskId verbatim. The replay adapter must propagate that
    // truth into the reducer's payload — otherwise resolveStepId reads
    // undefined and collapses every child event onto whichever step is
    // currently `running` (s-d1 in this parallel scenario).
    const events = buildEvents({ withPayloadTaskId: false });
    const turn = replayProcessLog(events, { taskId: 't-multi' });
    assertDelegateAttribution(turn);
  });
});

describe('historical replay parity — incomplete logs', () => {
  test('log without task:complete is classified missing-terminal; running steps stay running', () => {
    resetSeq();
    const events: PersistedTaskEvent[] = [
      persisted('task:start', { input: { id: 't-multi' } }),
      persisted('agent:plan_update', {
        steps: [
          { id: 's1', label: 'A', status: 'running', strategy: 'llm-reasoning' },
          { id: 's2', label: 'B', status: 'pending', strategy: 'llm-reasoning' },
        ],
      }),
    ];
    const turn = replayProcessLog(events, { taskId: 't-multi' });
    const completeness = replayCompleteness(events.map((e) => ({ eventType: e.eventType, payload: e.payload, ts: e.ts })));
    expect(completeness.kind).toBe('missing-terminal');
    // Honest reducer state — the previous "force everything to done" hack
    // is gone; running steps stay running so the banner can warn the user.
    expect(turn.status).toBe('running');
    expect(turn.planSteps[0]!.status).toBe('running');
    expect(turn.planSteps[1]!.status).toBe('pending');
  });

  test('log paused on plan-approval gate is classified awaiting-user', () => {
    resetSeq();
    const events: PersistedTaskEvent[] = [
      persisted('task:start', { input: { id: 't-multi' } }),
      persisted('workflow:plan_ready', { awaitingApproval: true }),
    ];
    const completeness = replayCompleteness(events.map((e) => ({ eventType: e.eventType, payload: e.payload, ts: e.ts })));
    expect(completeness.kind).toBe('awaiting-user');
  });
});
