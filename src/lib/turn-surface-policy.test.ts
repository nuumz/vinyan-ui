/**
 * Unit tests for `buildTurnSurfaceRenderPolicy`. Pure function — covers each
 * surface's show/hide trigger plus the live/historical mode delta. The tests
 * deliberately use `emptyTurn` + small mutations rather than running the
 * reducer end-to-end, so a regression in the reducer doesn't leak into the
 * policy assertions.
 */
import { describe, expect, test } from 'bun:test';
import { emptyTurn, type StreamingTurn } from '@/hooks/use-streaming-turn';
import { buildTurnSurfaceRenderPolicy } from './turn-surface-policy';

function turnWith(patch: Partial<StreamingTurn>): StreamingTurn {
  return { ...emptyTurn({ taskId: 't-test' }), ...patch };
}

describe('buildTurnSurfaceRenderPolicy', () => {
  test('conversational reply: only final answer + diagnostics-on-demand', () => {
    const turn = turnWith({ finalContent: 'hi' });
    const p = buildTurnSurfaceRenderPolicy(turn, 'live');
    expect(p.showStageManifest).toBe(false);
    expect(p.showAgentTimeline).toBe(false);
    expect(p.showPlanSurface).toBe(false);
    expect(p.showCodingCli).toBe(false);
    expect(p.showFinalAnswer).toBe(true);
    expect(p.showProcessTimeline).toBe(false);
    expect(p.suppressDelegateOutputsInPlan).toBe(false);
  });

  test('single-agent workflow: stage + plan + final answer; no delegate de-dup', () => {
    const turn = turnWith({
      decisionStage: {
        taskId: 't-test',
        userPrompt: 'do X',
        decisionKind: 'single-agent',
        createdAt: 1,
      },
      planSteps: [
        { id: 's1', label: 'A', status: 'done', toolCallIds: [], strategy: 'llm-reasoning' },
        { id: 's2', label: 'B', status: 'done', toolCallIds: [], strategy: 'llm-reasoning' },
      ],
      finalContent: 'answer',
    });
    const p = buildTurnSurfaceRenderPolicy(turn, 'live');
    expect(p.showStageManifest).toBe(true);
    expect(p.showAgentTimeline).toBe(false);
    expect(p.showPlanSurface).toBe(true);
    expect(p.showFinalAnswer).toBe(true);
    expect(p.suppressDelegateOutputsInPlan).toBe(false);
  });

  test('multi-agent workflow: agent timeline owns delegate outputs', () => {
    const turn = turnWith({
      decisionStage: {
        taskId: 't-test',
        userPrompt: 'race agents',
        decisionKind: 'multi-agent',
        createdAt: 1,
      },
      multiAgentGroupMode: 'competition',
      multiAgentSubtasks: [
        {
          subtaskId: 'st-1',
          parentTaskId: 't-test',
          stepId: 's-d1',
          fallbackLabel: 'Agent 1',
          title: 'A',
          objective: 'answer',
          prompt: 'go',
          inputRefs: [],
          status: 'done',
        },
        {
          subtaskId: 'st-2',
          parentTaskId: 't-test',
          stepId: 's-d2',
          fallbackLabel: 'Agent 2',
          title: 'B',
          objective: 'answer',
          prompt: 'go',
          inputRefs: [],
          status: 'done',
        },
      ],
      planSteps: [
        { id: 's-d1', label: '$step1.result', status: 'done', toolCallIds: [], strategy: 'delegate-sub-agent' },
        { id: 's-d2', label: '$step1.result', status: 'done', toolCallIds: [], strategy: 'delegate-sub-agent' },
      ],
      finalContent: 'synthesized',
    });
    const p = buildTurnSurfaceRenderPolicy(turn, 'live');
    expect(p.showStageManifest).toBe(true);
    expect(p.showAgentTimeline).toBe(true);
    expect(p.showPlanSurface).toBe(true);
    expect(p.showFinalAnswer).toBe(true);
    expect(p.suppressDelegateOutputsInPlan).toBe(true);
  });

  test('single delegate (1 row) does NOT trigger suppress: PlanSurface still owns the output', () => {
    const turn = turnWith({
      multiAgentSubtasks: [
        {
          subtaskId: 'st-1',
          parentTaskId: 't-test',
          stepId: 's-d1',
          fallbackLabel: 'Agent 1',
          title: 'A',
          objective: 'answer',
          prompt: 'go',
          inputRefs: [],
          status: 'done',
        },
      ],
      planSteps: [
        { id: 's-d1', label: 'work', status: 'done', toolCallIds: [], strategy: 'delegate-sub-agent' },
      ],
    });
    const p = buildTurnSurfaceRenderPolicy(turn, 'live');
    expect(p.showAgentTimeline).toBe(true);
    expect(p.suppressDelegateOutputsInPlan).toBe(false);
  });

  test('historical mode opens stage manifest by default when present', () => {
    const turn = turnWith({
      decisionStage: {
        taskId: 't-test',
        userPrompt: 'q',
        decisionKind: 'single-agent',
        createdAt: 1,
      },
    });
    const live = buildTurnSurfaceRenderPolicy(turn, 'live');
    const hist = buildTurnSurfaceRenderPolicy(turn, 'historical');
    expect(live.defaultOpenSections.has('stageManifest')).toBe(false);
    expect(hist.defaultOpenSections.has('stageManifest')).toBe(true);
  });

  test('historical mode without decision/todos keeps default-open empty', () => {
    const turn = turnWith({ finalContent: 'plain reply' });
    const hist = buildTurnSurfaceRenderPolicy(turn, 'historical');
    expect(hist.showStageManifest).toBe(false);
    expect(hist.defaultOpenSections.has('stageManifest')).toBe(false);
  });

  test('coding CLI sessions trigger CodingCliCard', () => {
    const turn = turnWith({
      codingCliSessions: {
        sess1: {
          id: 'sess1',
          providerId: 'claude-code',
          state: 'running',
          createdAt: Date.now(),
          toolActivity: [],
          filesChanged: [],
          commandsRequested: [],
          decisions: [],
        } as unknown as StreamingTurn['codingCliSessions'][string],
      },
    });
    const p = buildTurnSurfaceRenderPolicy(turn, 'live');
    expect(p.showCodingCli).toBe(true);
  });

  test('process log gates ProcessTimeline visibility', () => {
    const empty = buildTurnSurfaceRenderPolicy(turnWith({}), 'live');
    expect(empty.showProcessTimeline).toBe(false);

    const withLog = buildTurnSurfaceRenderPolicy(
      turnWith({
        processLog: [
          { id: 'p1', kind: 'agent_routed', label: 'r', status: 'info', at: 1 },
        ],
      }),
      'live',
    );
    expect(withLog.showProcessTimeline).toBe(true);
  });

  test('todoList alone (no decisionStage) is enough to render StageManifest', () => {
    const turn = turnWith({
      todoList: [
        {
          id: 'todo-1',
          title: 'one',
          ownerType: 'agent',
          status: 'pending',
          dependsOn: [],
        },
      ],
    });
    const p = buildTurnSurfaceRenderPolicy(turn, 'live');
    expect(p.showStageManifest).toBe(true);
  });
});
