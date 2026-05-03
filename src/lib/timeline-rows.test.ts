/**
 * Tests for `buildTimelineRows` (Phase A — `processLog` parity).
 *
 * Each test calls the pure function with a focused turn snapshot and
 * asserts the row stream's order, kind, actor, and severity. Phase B
 * (Slice 3) will extend with plan-step / tool / sub-agent / gate /
 * oracle / critic rows — locking these contracts now means a regression
 * in the reducer doesn't leak into the timeline silently.
 */
import { describe, expect, test } from 'bun:test';
import { emptyTurn, type StreamingTurn } from '@/hooks/use-streaming-turn';
import { buildTimelineRows } from './timeline-rows';

function turnWith(patch: Partial<StreamingTurn>): StreamingTurn {
  return { ...emptyTurn({ taskId: 't-test' }), ...patch };
}

describe('buildTimelineRows — Phase A (processLog parity)', () => {
  test('empty turn → no rows', () => {
    expect(buildTimelineRows(turnWith({}), 'live')).toEqual([]);
    expect(buildTimelineRows(turnWith({}), 'historical')).toEqual([]);
  });

  test('process log entries become process rows in order', () => {
    const turn = turnWith({
      processLog: [
        { id: 'p1', kind: 'skill_match', label: 'matched skill', status: 'success', at: 100 },
        { id: 'p2', kind: 'agent_routed', label: 'routed to dev', status: 'info', at: 200 },
        { id: 'p3', kind: 'agent_synthesized', label: 'synthesized', status: 'success', at: 300 },
      ],
    });

    const rows = buildTimelineRows(turn, 'live');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      kind: 'process',
      actor: 'orchestrator',
      label: 'matched skill',
      severity: 'success',
      processKind: 'skill_match',
      ts: 100,
    });
    expect(rows[1].processKind).toBe('agent_routed');
    expect(rows[2].processKind).toBe('agent_synthesized');
  });

  test('multi-agent turns drop agent_routed entries (de-dup vs AgentRosterCard)', () => {
    const turn = turnWith({
      processLog: [
        { id: 'p1', kind: 'agent_routed', label: 'routed to A', status: 'info', at: 100 },
        { id: 'p2', kind: 'agent_routed', label: 'routed to B', status: 'info', at: 110 },
        { id: 'p3', kind: 'agent_synthesized', label: 'synth', status: 'success', at: 200 },
      ],
      multiAgentSubtasks: [
        {
          subtaskId: 'st1',
          parentTaskId: 't-test',
          stepId: 's1',
          fallbackLabel: 'Agent 1',
          title: 'A',
          objective: 'do A',
          prompt: '',
          inputRefs: [],
          status: 'done',
        },
        {
          subtaskId: 'st2',
          parentTaskId: 't-test',
          stepId: 's2',
          fallbackLabel: 'Agent 2',
          title: 'B',
          objective: 'do B',
          prompt: '',
          inputRefs: [],
          status: 'done',
        },
      ],
    });

    const rows = buildTimelineRows(turn, 'live');
    expect(rows).toHaveLength(1);
    expect(rows[0].processKind).toBe('agent_synthesized');
  });

  test('single-agent turns keep their lone agent_routed entry', () => {
    const turn = turnWith({
      processLog: [
        { id: 'p1', kind: 'agent_routed', label: 'routed to dev', status: 'info', at: 100 },
      ],
    });
    const rows = buildTimelineRows(turn, 'live');
    expect(rows).toHaveLength(1);
    expect(rows[0].processKind).toBe('agent_routed');
  });

  test('severity maps from process status', () => {
    const turn = turnWith({
      processLog: [
        { id: 'p1', kind: 'skill_match', label: 'a', status: 'success', at: 1 },
        { id: 'p2', kind: 'skill_miss', label: 'b', status: 'warn', at: 2 },
        {
          id: 'p3',
          kind: 'agent_synthesis_failed',
          label: 'c',
          status: 'error',
          at: 3,
        },
        { id: 'p4', kind: 'agent_routed', label: 'd', status: 'info', at: 4 },
      ],
    });

    const rows = buildTimelineRows(turn, 'live');
    expect(rows.map((r) => r.severity)).toEqual(['success', 'warn', 'error', 'info']);
  });

  test('mode does not affect Phase A row content (lock-step parity)', () => {
    const turn = turnWith({
      processLog: [
        { id: 'p1', kind: 'skill_match', label: 'matched', status: 'success', at: 100 },
        { id: 'p2', kind: 'agent_synthesized', label: 'synth', status: 'success', at: 200 },
      ],
    });

    const live = buildTimelineRows(turn, 'live');
    const historical = buildTimelineRows(turn, 'historical');
    expect(live).toEqual(historical);
  });
});
