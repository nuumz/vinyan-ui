/**
 * Cache-seeding contract for `useSessionEventHistory`.
 *
 * `useSessionEventHistory` runs on `SessionChat` mount, fetches the
 * cross-task event log for the session, and seeds each task's
 * `['task-event-history', taskId]` query cache so consumers like
 * `HistoricalProcessCard` (via `useTaskEvents`) read from cache
 * without a second round-trip.
 *
 * The hook delegates the seeding side-effect to the pure helper
 * `seedTaskCachesFromSessionEvents` so the contract is testable
 * without mounting React. These tests exercise the helper directly:
 * grouping, sorting, and the skip-on-fresher-cache invariant that
 * keeps a per-task fetch authoritative if it already populated the
 * cache.
 *
 * Run: bun test src/hooks/use-session-event-history.test.ts
 */
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import {
  seedTaskCachesFromSessionEvents,
  type PersistedSessionEvent,
} from './use-session-event-history';

function ev(taskId: string, seq: number, eventType: string, ts = seq * 100): PersistedSessionEvent {
  return {
    id: `${taskId}-${seq}`,
    taskId,
    seq,
    eventType,
    payload: {},
    ts,
  };
}

describe('seedTaskCachesFromSessionEvents', () => {
  test('groups events by taskId and seeds each per-task cache', () => {
    const qc = new QueryClient();
    const events = [
      ev('task-A', 1, 'task:start'),
      ev('task-A', 2, 'workflow:plan_created'),
      ev('task-B', 1, 'task:start'),
      ev('task-B', 2, 'workflow:step_start'),
    ];

    const result = seedTaskCachesFromSessionEvents(qc, events);

    expect(result.taskCount).toBe(2);
    const cacheA = qc.getQueryData(['task-event-history', 'task-A']) as
      | { taskId: string; events: PersistedSessionEvent[]; lastSeq?: number }
      | undefined;
    const cacheB = qc.getQueryData(['task-event-history', 'task-B']) as
      | { taskId: string; events: PersistedSessionEvent[]; lastSeq?: number }
      | undefined;
    expect(cacheA?.taskId).toBe('task-A');
    expect(cacheA?.events.map((e) => e.eventType)).toEqual(['task:start', 'workflow:plan_created']);
    expect(cacheA?.lastSeq).toBe(2);
    expect(cacheB?.taskId).toBe('task-B');
    expect(cacheB?.events.map((e) => e.eventType)).toEqual(['task:start', 'workflow:step_start']);
  });

  test('sorts each per-task slice by seq even when input is interleaved', () => {
    const qc = new QueryClient();
    // Bulk endpoint orders cross-task by `(ts, id)`, so per-task events
    // can arrive out of seq order from the wire.
    const events = [
      ev('task-A', 2, 'workflow:plan_created', 200),
      ev('task-B', 1, 'task:start', 250),
      ev('task-A', 1, 'task:start', 300),
      ev('task-A', 3, 'workflow:step_start', 400),
    ];

    seedTaskCachesFromSessionEvents(qc, events);

    const cacheA = qc.getQueryData(['task-event-history', 'task-A']) as
      | { events: PersistedSessionEvent[] }
      | undefined;
    expect(cacheA?.events.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  test('preserves a fresher per-task cache (skip-on-fresher invariant)', () => {
    const qc = new QueryClient();
    // Per-task fetch already populated the cache with 3 events while
    // the bulk fetch only saw 1 (server pagination cut us off).
    const existing = {
      taskId: 'task-A',
      events: [ev('task-A', 1, 'task:start'), ev('task-A', 2, 'workflow:plan_created'), ev('task-A', 3, 'task:complete')],
      lastSeq: 3,
    };
    qc.setQueryData(['task-event-history', 'task-A'], existing);

    seedTaskCachesFromSessionEvents(qc, [ev('task-A', 1, 'task:start')]);

    const after = qc.getQueryData(['task-event-history', 'task-A']) as
      | { events: PersistedSessionEvent[]; lastSeq?: number }
      | undefined;
    expect(after?.events.length).toBe(3);
    expect(after?.lastSeq).toBe(3);
  });

  test('overwrites a stale cache when bulk fetch returns more events', () => {
    const qc = new QueryClient();
    qc.setQueryData(['task-event-history', 'task-A'], {
      taskId: 'task-A',
      events: [ev('task-A', 1, 'task:start')],
      lastSeq: 1,
    });

    seedTaskCachesFromSessionEvents(qc, [
      ev('task-A', 1, 'task:start'),
      ev('task-A', 2, 'workflow:plan_created'),
      ev('task-A', 3, 'task:complete'),
    ]);

    const after = qc.getQueryData(['task-event-history', 'task-A']) as
      | { events: PersistedSessionEvent[]; lastSeq?: number }
      | undefined;
    expect(after?.events.length).toBe(3);
    expect(after?.lastSeq).toBe(3);
  });

  test('no-op on empty event list', () => {
    const qc = new QueryClient();
    const result = seedTaskCachesFromSessionEvents(qc, []);
    expect(result.taskCount).toBe(0);
    // No keys created.
    expect(qc.getQueryData(['task-event-history', 'task-A'])).toBeUndefined();
  });

  test('does not pollute unrelated cache namespaces', () => {
    const qc = new QueryClient();
    // Adjacent cache key the seeder must not touch.
    qc.setQueryData(['tasks'], { tasks: [], total: 0 });

    seedTaskCachesFromSessionEvents(qc, [ev('task-A', 1, 'task:start')]);

    const tasks = qc.getQueryData(['tasks']) as { tasks: unknown[]; total: number } | undefined;
    expect(tasks?.total).toBe(0);
    expect(tasks?.tasks).toEqual([]);
  });
});
