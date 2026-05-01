/**
 * Component-level test — HistoricalProcessCard renders the BACKEND
 * projection's completeness, not the local classifier, when both are
 * available.
 *
 * Strategy:
 *   - Mock `@/hooks/use-task-process-state` and `@/hooks/use-task-events`
 *     via `bun:test`'s `mock.module` so the component's hooks resolve
 *     synchronously without React Query / network.
 *   - Render the component to a static HTML string with
 *     `react-dom/server` (no jsdom needed — Bun ships a server build).
 *   - Assert against the rendered text. The backend's `awaiting-user`
 *     produces "Recording paused on a user gate" via
 *     `<ReplayCompletenessBanner>`. The local fallback for an empty
 *     event list produces "No persisted events for this task" — a
 *     different banner. Confusing the two paths is impossible: the
 *     visible label only matches when the right branch ran.
 *
 * If a future regression causes the component to bypass the
 * projection (e.g. someone reverts to inlining `replayCompleteness`),
 * the projection-priority test below would render the empty-events
 * banner instead of the awaiting-user banner — and the assertion would
 * fail loudly.
 */
import { describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TaskProcessProjection } from '@/lib/api-client';

// Per-test state the mocks read from.
let projectionData: TaskProcessProjection | null = null;
let eventsData: ReadonlyArray<{ eventType: string; ts: number }> = [];
let unsupportedFlag = false;
let errorFlag: unknown = null;

mock.module('@/hooks/use-task-process-state', () => ({
  useTaskProcessState: () => ({
    data: projectionData,
    isLoading: false,
    isFetching: false,
    error: null,
    notFound: false,
    refetch: () => {},
  }),
}));

mock.module('@/hooks/use-task-events', () => ({
  useTaskEvents: () => ({
    events: eventsData,
    turn: null,
    isLoading: false,
    error: errorFlag,
    unsupported: unsupportedFlag,
  }),
}));

const { HistoricalProcessCard } = await import('@/components/chat/historical-process-card');

function makeBackendAwaitingUser(): TaskProcessProjection {
  return {
    lifecycle: { taskId: 'task-1', status: 'running' },
    completeness: { kind: 'awaiting-user', eventCount: 5, truncated: false, firstTs: 1000, lastTs: 2000 },
    gates: {
      approval: { open: false, resolved: false },
      workflowHumanInput: { open: true, resolved: false },
      partialDecision: { open: false, resolved: false },
      codingCliApproval: { open: false, resolved: false },
    },
    plan: { todoList: [], steps: [], multiAgentSubtasks: [] },
    codingCliSessions: [],
    diagnostics: { phases: [], toolCalls: [], oracleVerdicts: [], escalations: [] },
    history: { lastSeq: 5, eventCount: 5, truncated: false, descendantTaskIds: [] },
  };
}

function render(): string {
  return renderToStaticMarkup(
    React.createElement(HistoricalProcessCard, { taskId: 'task-1' }),
  );
}

describe('HistoricalProcessCard — backend projection authority', () => {
  test('renders backend "awaiting-user" banner even though events array is empty (projection wins)', () => {
    projectionData = makeBackendAwaitingUser();
    eventsData = []; // local classifier on this would say 'empty'
    unsupportedFlag = false;
    errorFlag = null;

    const html = render();

    // Backend authority — should show the awaiting-user banner.
    expect(html).toContain('Recording paused on a user gate');
    // The local-fallback banner MUST NOT appear; if it does, the
    // component bypassed the projection.
    expect(html).not.toContain('No persisted events for this task');
  });

  test('renders backend "terminal-error" banner regardless of empty events', () => {
    projectionData = {
      ...makeBackendAwaitingUser(),
      completeness: { kind: 'terminal-error', eventCount: 9, truncated: false, reason: 'task:failed' },
    };
    eventsData = [];

    const html = render();

    expect(html).toContain('Terminal error');
    expect(html).not.toContain('No persisted events for this task');
  });

  test('falls back to local "empty" banner when projection is absent', () => {
    projectionData = null; // simulate projection not yet loaded / 404
    eventsData = [];
    unsupportedFlag = false;
    errorFlag = null;

    const html = render();

    // No projection → local replayCompleteness on empty events → 'empty'.
    expect(html).toContain('No persisted events for this task');
    expect(html).not.toContain('Recording paused on a user gate');
  });

  test('falls back to local "unsupported" banner when projection absent and recorder is off', () => {
    projectionData = null;
    eventsData = [];
    unsupportedFlag = true;
    errorFlag = null;

    const html = render();

    expect(html).toContain('Process history unavailable');
  });
});
