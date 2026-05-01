import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ListTasksParams } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';
import { useFallbackInterval } from './use-fallback-interval';

/**
 * Operations console list query.
 *
 * Accepts the same filter shape as `GET /api/v1/tasks` so a single hook
 * powers both the dense table and the per-status drilldowns. Polling is
 * SSE-fallback only — when the live event stream is healthy, refetches
 * happen via `qk.tasks` invalidation; this hook just hands back the
 * cached response between events.
 */
export function useTasks(params: ListTasksParams = {}) {
  return useQuery({
    queryKey: qk.tasksList(params as Record<string, unknown>),
    queryFn: () => api.getTasks(params),
    refetchInterval: useFallbackInterval(30_000),
    placeholderData: (prev) => prev,
  });
}

/**
 * Detail view for one task. Used by the operations console drawer
 * Overview / Result / Trace / Actions tabs. The Process tab uses the
 * existing `useTaskEvents` hook directly so the historical replay
 * path stays in lock-step with the live chat bubble.
 */
export function useTaskDetail(taskId: string | undefined) {
  return useQuery({
    queryKey: taskId ? qk.taskDetail(taskId) : ['tasks', 'detail', 'disabled'],
    queryFn: () => api.getTask(taskId!),
    enabled: !!taskId,
    staleTime: 10_000,
  });
}

export function useSubmitTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.submitAsyncTask(body),
    onSuccess: () => {
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
    onSuccess: (_, taskId) => {
      qc.invalidateQueries({ queryKey: qk.tasks });
      qc.invalidateQueries({ queryKey: qk.taskDetail(taskId) });
    },
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

/** Soft-hide a task row. Audit data preserved server-side. */
export function useArchiveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.archiveTask(taskId),
    onSuccess: (_, taskId) => {
      qc.invalidateQueries({ queryKey: qk.tasks });
      qc.invalidateQueries({ queryKey: qk.taskDetail(taskId) });
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to archive task' });
    },
  });
}

export function useUnarchiveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.unarchiveTask(taskId),
    onSuccess: (_, taskId) => {
      qc.invalidateQueries({ queryKey: qk.tasks });
      qc.invalidateQueries({ queryKey: qk.taskDetail(taskId) });
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to unarchive task' });
    },
  });
}

/**
 * Bundled JSON snapshot — task summary + result + persisted event log.
 * The mutation returns the export payload so the caller can trigger a
 * `Blob` download on success (UI lives in the drawer's Actions tab).
 */
export function useExportTask() {
  return useMutation({
    mutationFn: (taskId: string) => api.exportTask(taskId),
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to export task' });
    },
  });
}
