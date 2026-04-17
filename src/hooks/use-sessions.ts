import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';

export function useSessions() {
  return useQuery({
    queryKey: qk.sessions,
    queryFn: () => api.getSessions().then((r) => r.sessions),
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.createSession('ui'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.sessions });
      toast.success('Session created');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to create session');
    },
  });
}

export function useCompactSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.compactSession(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.sessions });
      toast.success('Session compacted');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to compact session');
    },
  });
}
