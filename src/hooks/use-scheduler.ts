import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type CreateScheduledJobBody } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';
import { useFallbackInterval } from './use-fallback-interval';

/**
 * Operations console list query — `GET /api/v1/scheduler/jobs`.
 *
 * SSE-fallback polling: when the live event stream is healthy, refetches
 * happen via `qk.scheduler` invalidation; this hook hands back cached
 * data between events.
 */
export function useScheduledJobs(params: { status?: string; profile?: string } = {}) {
  return useQuery({
    queryKey: qk.schedulerList(params.status, params.profile),
    queryFn: () => api.getScheduledJobs(params),
    refetchInterval: useFallbackInterval(60_000),
    placeholderData: (prev) => prev,
  });
}

export function useScheduledJob(id: string | undefined) {
  return useQuery({
    queryKey: id ? qk.schedulerJob(id) : ['scheduler', 'job', 'disabled'],
    queryFn: () => api.getScheduledJob(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCreateScheduledJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateScheduledJobBody) => api.createScheduledJob(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.scheduler }),
    onError: (err) => toast.apiError(err, { fallback: 'Failed to create scheduled job' }),
  });
}

export function useUpdateScheduledJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Partial<CreateScheduledJobBody> }) =>
      api.updateScheduledJob(args.id, args.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.scheduler }),
    onError: (err) => toast.apiError(err, { fallback: 'Failed to update scheduled job' }),
  });
}

export function usePauseScheduledJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.pauseScheduledJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.scheduler }),
    onError: (err) => toast.apiError(err, { fallback: 'Failed to pause job' }),
  });
}

export function useResumeScheduledJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.resumeScheduledJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.scheduler }),
    onError: (err) => toast.apiError(err, { fallback: 'Failed to resume job' }),
  });
}

export function useRunScheduledJobNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.runScheduledJobNow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.scheduler });
      qc.invalidateQueries({ queryKey: qk.tasks });
    },
    onError: (err) => toast.apiError(err, { fallback: 'Failed to run job now' }),
  });
}

export function useDeleteScheduledJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteScheduledJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.scheduler }),
    onError: (err) => toast.apiError(err, { fallback: 'Failed to delete job' }),
  });
}
