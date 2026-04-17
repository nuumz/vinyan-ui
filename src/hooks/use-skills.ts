import { useQuery } from '@tanstack/react-query';
import { api, type CachedSkill } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

type SkillStatus = CachedSkill['status'];

export function useSkills(status?: SkillStatus) {
  return useQuery({
    queryKey: qk.skills(status),
    queryFn: () => api.getSkills(status).then((r) => r.skills),
    refetchInterval: useFallbackInterval(60_000),
  });
}
