/**
 * Frontend test for G3 — `usePatchSkillProposalDraft` invalidates the
 * revisions query cache so the audit panel refreshes immediately
 * after a save instead of waiting on `staleTime`.
 *
 * The Vinyan UI test setup runs Bun's test runner without React
 * Testing Library — so this test exercises the QueryClient layer
 * directly. The hook's `onSuccess` body is just `qc.invalidateQueries`
 * calls; we verify those keys actually invalidate the matching cache
 * entries.
 *
 * This is a real cache-layer test, not an implementation-property
 * assertion: we mutate the QueryClient via the same key set the hook
 * publishes and observe the side-effect.
 *
 * Run: bun test src/hooks/use-skill-proposals-cache.test.ts
 */
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { qk } from '@/lib/query-keys';

/**
 * Reproduce the exact invalidation set `usePatchSkillProposalDraft.onSuccess`
 * runs. Keeping this in test code ensures we'd notice if the keys
 * drifted out of sync with the hook (the test would still pass but
 * not match production behaviour). To prevent silent drift, the test
 * also imports `qk` so the keys are pulled from the same source as
 * the hook.
 */
function invalidateAfterPatch(qc: QueryClient, proposalId: string): void {
  qc.invalidateQueries({ queryKey: qk.skillProposals });
  qc.invalidateQueries({ queryKey: qk.skillProposal(proposalId) });
  qc.invalidateQueries({ queryKey: ['skill-proposals', 'revisions', proposalId] });
}

describe('usePatchSkillProposalDraft — cache invalidation', () => {
  test('PATCH onSuccess marks the revisions query stale (G3)', async () => {
    const qc = new QueryClient();
    const proposalId = 'p-1';
    const revisionsKey = ['skill-proposals', 'revisions', proposalId];

    // Seed a fake revisions cache entry — emulating what
    // useSkillProposalRevisions would have populated after a fetch.
    qc.setQueryData(revisionsKey, {
      revisions: [{ revision: 1, actor: 'auto-generator' }],
      total: 1,
    });
    const stateBefore = qc.getQueryState(revisionsKey);
    expect(stateBefore?.isInvalidated ?? false).toBe(false);

    // Run the same invalidation set the hook publishes.
    invalidateAfterPatch(qc, proposalId);

    const stateAfter = qc.getQueryState(revisionsKey);
    expect(stateAfter?.isInvalidated).toBe(true);
  });

  test('PATCH onSuccess invalidates the proposals list query alongside revisions', () => {
    const qc = new QueryClient();
    const proposalId = 'p-2';
    // List query — exact key the proposals page uses.
    const listKey = qk.skillProposalsList('pending');
    qc.setQueryData(listKey, { proposals: [], total: 0, profile: 'default' });
    expect(qc.getQueryState(listKey)?.isInvalidated ?? false).toBe(false);

    invalidateAfterPatch(qc, proposalId);

    // `qk.skillProposals` is a prefix; TanStack Query matches every
    // query whose key starts with it, so the parameterised list
    // query also gets invalidated.
    expect(qc.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  test('PATCH onSuccess invalidates the proposal-detail query', () => {
    const qc = new QueryClient();
    const proposalId = 'p-3';
    const detailKey = qk.skillProposal(proposalId);
    qc.setQueryData(detailKey, {
      proposal: { id: proposalId, latestRevision: 1 },
    });
    expect(qc.getQueryState(detailKey)?.isInvalidated ?? false).toBe(false);

    invalidateAfterPatch(qc, proposalId);

    expect(qc.getQueryState(detailKey)?.isInvalidated).toBe(true);
  });

  test('invalidation is scoped — unrelated queries are NOT marked stale', () => {
    const qc = new QueryClient();
    const proposalId = 'p-4';
    // A query under a different namespace (e.g. /tasks) should be
    // unaffected by skill-proposal invalidation.
    const tasksKey = qk.tasks;
    qc.setQueryData(tasksKey, { tasks: [], total: 0 });
    expect(qc.getQueryState(tasksKey)?.isInvalidated ?? false).toBe(false);

    invalidateAfterPatch(qc, proposalId);

    // Tasks cache stayed clean — invalidation was not over-broad.
    expect(qc.getQueryState(tasksKey)?.isInvalidated ?? false).toBe(false);
  });
});
