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

    // Surface visibility — StageManifest is suppressed for delegate flows
    // (decision label, group chip, done/total, rationale, routing/conf
    // fold into AgentTimelineCard's header instead). The default-open hint
    // for stageManifest is moot in this case; AgentTimelineCard renders
    // the metadata inline without a click.
    expect(policy.showStageManifest).toBe(false);
    expect(policy.agentTimelineOwnsDecisionMeta).toBe(true);
    expect(policy.showAgentTimeline).toBe(true);
    expect(policy.showPlanSurface).toBe(true);
    expect(policy.showFinalAnswer).toBe(true);
    expect(policy.suppressDelegateOutputsInPlan).toBe(true);

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
