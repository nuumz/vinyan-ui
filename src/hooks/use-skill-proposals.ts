import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';
import { useFallbackInterval } from './use-fallback-interval';

/**
 * `GET /api/v1/skill-proposals` — list quarantined / pending / approved
 * proposals for the current profile.
 */
export function useSkillProposals(params: { status?: string } = {}) {
  return useQuery({
    queryKey: qk.skillProposalsList(params.status),
    queryFn: () => api.getSkillProposals(params),
    refetchInterval: useFallbackInterval(60_000),
    placeholderData: (prev) => prev,
  });
}

export function useSkillProposal(id: string | undefined) {
  return useQuery({
    queryKey: id ? qk.skillProposal(id) : ['skill-proposals', 'detail', 'disabled'],
    queryFn: () => api.getSkillProposal(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useApproveSkillProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; decidedBy: string; reason?: string }) => {
      const { id, ...body } = args;
      return api.approveSkillProposal(id, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.skillProposals }),
    onError: (err) => toast.apiError(err, { fallback: 'Failed to approve proposal' }),
  });
}

export function useRejectSkillProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; decidedBy: string; reason: string }) => {
      const { id, ...body } = args;
      return api.rejectSkillProposal(id, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.skillProposals }),
    onError: (err) => toast.apiError(err, { fallback: 'Failed to reject proposal' }),
  });
}

export function useSetSkillProposalTrustTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; tier: string; decidedBy: string }) => {
      const { id, ...body } = args;
      return api.setSkillProposalTrustTier(id, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.skillProposals }),
    onError: (err) => toast.apiError(err, { fallback: 'Failed to set trust tier' }),
  });
}

export function useDeleteSkillProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteSkillProposal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.skillProposals }),
    onError: (err) => toast.apiError(err, { fallback: 'Failed to delete proposal' }),
  });
}
