import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { qk } from '@/lib/query-keys';
import { useFallbackInterval } from './use-fallback-interval';

export function useCalibration() {
  return useQuery({
    queryKey: qk.calibration,
    queryFn: () => api.getCalibration(),
    refetchInterval: useFallbackInterval(60_000),
  });
}
