import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';
import { toast } from '@/store/toast-store';

export function useSleepCycle() {
  return useQuery({
    queryKey: qk.sleepCycle,
    queryFn: () => api.getSleepCycle(),
    refetchInterval: useFallbackInterval(30_000),
  });
}

export function useTriggerSleepCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.triggerSleepCycle(),
    onSuccess: () => {
      toast.success('Sleep cycle triggered — running in background');
      qc.invalidateQueries({ queryKey: qk.sleepCycle });
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Trigger failed' });
    },
  });
}
