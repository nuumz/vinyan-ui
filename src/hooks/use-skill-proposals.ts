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
    mutationFn: (args: { id: string; decidedBy: string; reason: string }) => {
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
    mutationFn: (args: { id: string; tier: string; decidedBy: string; reason: string }) => {
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

/**
 * Live safety-scan for the editor. Not exposed as a `useQuery` —
 * the editor manages its own debounce so the network call only fires
 * once per pause-in-typing.
 */
export function useScanSkillProposalDraft() {
  return useMutation({
    mutationFn: (skillMd: string) => api.scanSkillProposalDraft(skillMd),
    onError: (err) => toast.apiError(err, { fallback: 'Safety scan failed' }),
  });
}

/**
 * PATCH the SKILL.md draft; bumps revision + re-scans server-side.
 *
 * G2 — accepts `expectedRevision` so two operators editing the same
 * proposal can't silently overwrite each other (server returns 412).
 *
 * G3 — invalidates the revisions query alongside the proposal queries
 * so the history list refreshes immediately instead of waiting on
 * `staleTime`.
 */
export function usePatchSkillProposalDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: string;
      skillMd: string;
      actor: string;
      reason?: string;
      expectedRevision?: number;
    }) => {
      const { id, ...body } = args;
      return api.patchSkillProposalDraft(id, body);
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: qk.skillProposals });
      qc.invalidateQueries({ queryKey: qk.skillProposal(id) });
      qc.invalidateQueries({ queryKey: ['skill-proposals', 'revisions', id] });
    },
    onError: (err) => {
      // Optimistic-locking failure surfaces a softer toast — the
      // editor should also re-fetch + repopulate the draft from the
      // new persisted state.
      const status = (err as { status?: number } | undefined)?.status;
      if (status === 412) {
        toast.warning('Another operator edited this proposal — reloading the latest revision.');
      } else if (status === 413) {
        toast.error('SKILL.md is too large. Trim before saving.');
      } else {
        toast.apiError(err, { fallback: 'Failed to save draft' });
      }
    },
  });
}

/** Revision history for a proposal — newest first. */
export function useSkillProposalRevisions(id: string | undefined) {
  return useQuery({
    queryKey: id ? ['skill-proposals', 'revisions', id] : ['skill-proposals', 'revisions', 'disabled'],
    queryFn: () => api.getSkillProposalRevisions(id!),
    enabled: !!id,
    staleTime: 10_000,
  });
}

/** R1 diagnostics — autogen threshold + signals + ledger + tracker. */
export function useAutogenPolicySnapshot() {
  return useQuery({
    queryKey: ['skill-proposals', 'autogen-policy'],
    queryFn: () => api.getAutogenPolicySnapshot(),
    staleTime: 30_000,
    refetchInterval: 90_000,
  });
}
