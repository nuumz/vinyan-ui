import { useQuery } from '@tanstack/react-query';
import { api, type GovernanceSearchFilters } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

/** A8/T2 — search persisted governance decisions by facet (decisionId, actor, policyVersion, time range). */
export function useGovernanceSearch(filters: GovernanceSearchFilters = {}) {
  const key = JSON.stringify(filters);
  return useQuery({
    queryKey: qk.governanceSearch(key),
    queryFn: () => api.searchGovernance(filters),
    refetchInterval: useFallbackInterval(30_000),
  });
}

/** A8/T2 — replay a single governance decision by id. Confidence is persisted (never recomputed). */
export function useGovernanceReplay(decisionId: string | null | undefined) {
  return useQuery({
    queryKey: qk.governanceReplay(decisionId ?? ''),
    queryFn: () => api.replayGovernanceDecision(decisionId as string),
    enabled: !!decisionId,
  });
}
