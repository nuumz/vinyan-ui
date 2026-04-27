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
      toast.apiError(err, { fallback: 'Failed to submit task' });
    },
  });
}

export function useCancelTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.cancelTask(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks }),
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to cancel task' });
    },
  });
}

/**
 * Manual retry for a failed/timed-out task. Uses POST /tasks/:id/retry so
 * the new task is linked to the parent and inherits sessionId/goal/files.
 */
export function useRetryTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      taskId: string;
      reason?: string;
      maxDurationMs?: number;
      goal?: string;
    }) => {
      const { taskId, ...body } = args;
      return api.retryTask(taskId, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tasks }),
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to retry task' });
    },
  });
}
