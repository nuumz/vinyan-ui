import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';
import { useFallbackInterval } from './use-fallback-interval';

export function useAgents() {
  return useQuery({
    queryKey: qk.agents,
    queryFn: () => api.getAgents().then((r) => r.agents),
    refetchInterval: useFallbackInterval(30_000),
  });
}

export function useAgent(id: string | null) {
  return useQuery({
    queryKey: id ? qk.agent(id) : qk.agent('__none__'),
    queryFn: () => api.getAgent(id as string),
    enabled: !!id,
    staleTime: 10_000,
  });
}

/**
 * Trigger a JSON download of the agent's full context. Returns the parsed
 * envelope so the caller can also re-display it inline if it wants. Toasts
 * on success or API error; the caller handles the actual file save.
 */
export function useExportAgentContext() {
  return useMutation<
    { agentId: string; context: unknown; exportedAt: number },
    Error,
    string
  >({
    mutationFn: (id) => api.exportAgentContext(id),
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to export agent context' });
    },
  });
}

/**
 * Operator-driven reset for a single proficiency entry. Invalidates the
 * agent detail query so the drawer re-renders without the removed row.
 */
export function useResetProficiency() {
  const qc = useQueryClient();
  return useMutation<
    { ok: true; removed: boolean; signature: string; remaining?: number },
    Error,
    { agentId: string; signature: string; reason?: string }
  >({
    mutationFn: ({ agentId, signature, reason }) =>
      api.resetProficiency(agentId, signature, reason),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: qk.agent(vars.agentId) });
      qc.invalidateQueries({ queryKey: qk.agents });
      if (data.removed) {
        toast.success(`Proficiency '${data.signature}' reset`);
      } else {
        toast.success(`No proficiency to remove for '${data.signature}'`);
      }
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to reset proficiency' });
    },
  });
}
