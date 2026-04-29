import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateSessionPayload,
  type ListSessionsParams,
  type Session,
  type SessionListState,
  type UpdateSessionPayload,
  api,
} from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';

/** Read all sessions across visibility states (kept for backwards-compat callers). */
export function useSessions() {
  return useQuery({
    queryKey: qk.sessions,
    queryFn: () => api.getSessions({ state: 'all' }).then((r) => r.sessions),
  });
}

/**
 * Filtered list — drives the Active / Archived / Trash tabs in the sessions
 * page. The cache key includes both `state` and `search` so React Query keeps
 * separate buckets per filter combination; the broader `qk.sessions`
 * invalidation in the mutations below clears all of them at once.
 */
export function useSessionsList(params: ListSessionsParams = {}) {
  const state: SessionListState = params.state ?? 'active';
  const source = params.source ?? 'all';
  const search = params.search?.trim() ?? '';
  return useQuery<Session[]>({
    queryKey: qk.sessionsList(state, source, search),
    queryFn: () =>
      api
        .getSessions({
          state,
          source,
          ...(search.length > 0 ? { search } : {}),
          ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
          ...(typeof params.offset === 'number' ? { offset: params.offset } : {}),
        })
        .then((r) => r.sessions),
  });
}

function invalidateSessions(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: qk.sessions });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSessionPayload = {}) => api.createSession(payload),
    onSuccess: () => {
      invalidateSessions(qc);
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to create session' });
    },
  });
}

export function useUpdateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSessionPayload }) =>
      api.updateSession(id, patch),
    onSuccess: (_data, variables) => {
      invalidateSessions(qc);
      qc.invalidateQueries({ queryKey: qk.sessionMessages(variables.id) });
      toast.success('Session updated');
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to update session' });
    },
  });
}

export function useArchiveSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveSession(id),
    onSuccess: () => {
      invalidateSessions(qc);
      toast.success('Session archived');
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to archive session' });
    },
  });
}

export function useUnarchiveSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.unarchiveSession(id),
    onSuccess: () => {
      invalidateSessions(qc);
      toast.success('Session unarchived');
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to unarchive session' });
    },
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSession(id),
    onSuccess: () => {
      invalidateSessions(qc);
      toast.success('Session moved to trash');
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to delete session' });
    },
  });
}

export function useRestoreSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restoreSession(id),
    onSuccess: () => {
      invalidateSessions(qc);
      toast.success('Session restored');
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to restore session' });
    },
  });
}

export function useCompactSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.compactSession(id),
    onSuccess: () => {
      invalidateSessions(qc);
      toast.success('Session compacted');
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to compact session' });
    },
  });
}
