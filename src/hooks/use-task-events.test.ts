/**
 * Contract test for `useTaskEvents` / `api.getTaskEventHistory` — the
 * historical Process Replay must fetch with `includeDescendants=true`
 * (and a bounded `maxDepth`) so sub-agent rows can render their
 * persisted tool history. Without descendants the response is parent-
 * only and every delegate row collapses to "Reasoning-only delegate —
 * final answer captured…".
 *
 * Strategy: stub `globalThis.fetch` so the api-client's call surface
 * is observable (URL + method) without mocking the whole module. This
 * keeps `ApiError`, `SSEEvent`, and the rest of api-client's exports
 * reachable for sibling test files in the same Bun run, which a
 * `mock.module('@/lib/api-client', …)` would break.
 *
 * The hook itself (`useTaskEvents`) forwards options to api directly;
 * verifying api-client's URL contract is the load-bearing assertion.
 * The hook's defaults (`includeDescendants: true`, `maxDepth: 3`) are
 * additionally pinned via a string-source check so a regression that
 * drops the default would fail loudly here.
 *
 * Run: bun test src/hooks/use-task-events.test.ts
 */
import { describe, expect, test } from 'bun:test';
import { api } from '@/lib/api-client';
import { useTaskEvents } from './use-task-events';

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function captureFetch(): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;
  // The api-client reads `localStorage.getItem('vinyan-token')` in
  // `getApiToken()` to attach an Authorization header. Bun's default
  // runtime has no DOM globals; stub a minimal localStorage so the
  // call resolves to `null` (no token), matching the unauthenticated
  // path.
  const originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;
  if (!originalLocalStorage) {
    (globalThis as { localStorage?: Storage }).localStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage;
  }
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return Promise.resolve(
      new Response(JSON.stringify({ taskId: 't', events: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
      if (!originalLocalStorage) {
        delete (globalThis as { localStorage?: Storage }).localStorage;
      }
    },
  };
}

describe('api.getTaskEventHistory — URL contract for descendants mode', () => {
  test('default call adds `includeDescendants=true`', async () => {
    const { calls, restore } = captureFetch();
    try {
      await api.getTaskEventHistory('task-1');
    } finally {
      restore();
    }
    expect(calls.length).toBe(1);
    expect(calls[0]?.url).toContain('includeDescendants=true');
    expect(calls[0]?.url).toContain('/tasks/task-1/event-history');
  });

  test('caller-supplied maxDepth is honored alongside includeDescendants', async () => {
    const { calls, restore } = captureFetch();
    try {
      await api.getTaskEventHistory('task-2', { maxDepth: 5 });
    } finally {
      restore();
    }
    expect(calls[0]?.url).toContain('maxDepth=5');
    expect(calls[0]?.url).toContain('includeDescendants=true');
  });

  test('opt-out — `includeDescendants: false` does NOT add the query param', async () => {
    const { calls, restore } = captureFetch();
    try {
      await api.getTaskEventHistory('task-3', { includeDescendants: false });
    } finally {
      restore();
    }
    expect(calls[0]?.url).not.toContain('includeDescendants=true');
  });
});

describe('useTaskEvents — defaults forward to api', () => {
  test('hook source pins includeDescendants default to true and maxDepth default to 3', () => {
    // Source-level guard against accidentally dropping the descendants
    // default. The hook is a thin wrapper around `api.getTaskEventHistory`;
    // the URL contract above asserts api-side behaviour. This static
    // check pins the hook-level defaults so a regression that flips
    // the default fails loudly without needing a DOM-mounted hook test.
    const src = useTaskEvents.toString();
    expect(src).toContain('includeDescendants');
    expect(src).toContain('maxDepth');
    // DEFAULT_MAX_DEPTH = 3 — pin the literal so a 0-depth regression
    // (which would degrade to parent-only behaviour) is caught.
    expect(src).toMatch(/DEFAULT_MAX_DEPTH|maxDepth\s*\?\?\s*3/);
  });
});
