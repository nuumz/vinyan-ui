import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';
import { useFallbackInterval } from './use-fallback-interval';

export function useTasks() {
  return useQuery({
    queryKey: qk.tasks,
    queryFn: () => api.getTasks().then((r) => r.tasks),
    refetchInterval: useFallbackInterval(30_000),
  });
}

export function useSubmitTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.submitAsyncTask(body),
    onSuccess: () => {
      // SSE task:start will also invalidate — this covers the case where SSE
      // is temporarily disconnected.
      qc.invalidateQueries({ queryKey: qk.tasks });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to submit task');
    },
  });
}

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.cancelTask(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks }),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel task');
    },
  });
}
