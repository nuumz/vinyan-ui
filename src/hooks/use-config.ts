import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';

export function useConfig() {
  return useQuery({
    queryKey: qk.config,
    queryFn: () => api.getConfig().then((r) => r.config),
    staleTime: 60_000,
  });
}

export function useValidateConfig() {
  return useMutation({
    mutationFn: (body: unknown) => api.validateConfig(body),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Validation request failed');
    },
  });
}
