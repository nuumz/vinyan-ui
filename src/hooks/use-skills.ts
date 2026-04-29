import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  api,
  type SimpleSkillWriteBody,
  type SkillCatalogItem,
  type SkillCatalogKind,
} from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { toast } from '@/store/toast-store';
import { useFallbackInterval } from './use-fallback-interval';

export interface SkillsFilter {
  kind?: SkillCatalogKind;
  agentId?: string;
  /** Legacy cached-skills status filter; only meaningful for kind: 'cached'. */
  status?: 'active' | 'probation' | 'demoted';
}

/**
 * Unified Skill Library list — combines simple SKILL.md files, heavy
 * epistemic SKILL.md, and cached approaches into one queryable surface.
 * The page filters/groups locally (kind tab, search), so this hook returns
 * everything by default.
 */
export function useSkills(filter?: SkillsFilter) {
  return useQuery({
    queryKey: qk.skills(filter),
    queryFn: async () => {
      const res = await api.getSkills(filter);
      // Server returns the unified array under `items` (preferred) or
      // legacy `skills`. Pick whichever is present so old responses still
      // render during a rolling deploy.
      const raw = (res.items ?? res.skills ?? []) as SkillCatalogItem[];
      return raw;
    },
    refetchInterval: useFallbackInterval(60_000),
  });
}

/** Fetch full detail for one catalog item by its kind-prefixed id. */
export function useSkill(id: string | null) {
  return useQuery({
    queryKey: qk.skill(id ?? '__none__'),
    queryFn: () => api.getSkill(id as string),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation<{ id: string; path: string }, Error, SimpleSkillWriteBody>({
    mutationFn: (body) => api.createSkill(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      toast.success('Skill created');
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to create skill' });
    },
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation<{ id: string }, Error, { id: string; body: SimpleSkillWriteBody }>({
    mutationFn: ({ id, body }) => api.updateSkill(id, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      qc.invalidateQueries({ queryKey: qk.skill(variables.id) });
      toast.success('Skill updated');
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to update skill' });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (id) => api.deleteSkill(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['skills'] });
      toast.success('Skill deleted');
    },
    onError: (err) => {
      toast.apiError(err, { fallback: 'Failed to delete skill' });
    },
  });
}
