/**
 * Données flotte Webfleet (cache React Query + indicateurs agrégés).
 * @module features/webfleet/hooks/useVehicles
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useEffect } from 'react';
import API_BASE from '../../../config/api';
/**
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useVehicles() {
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ['webfleet-vehicles'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/webfleet/vehicles`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      const json = await res.json();
      return Array.isArray(json.data) ? json.data : [];
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (q.isSuccess && q.dataUpdatedAt) {
      queryClient.invalidateQueries({ queryKey: ['webfleet-trips'] });
    }
  }, [q.isSuccess, q.dataUpdatedAt, queryClient]);

  const stats = useMemo(() => {
    const list = q.data || [];
    let activeCount = 0;
    let movingCount = 0;
    let stoppedCount = 0;
    let engineOffCount = 0;
    for (const v of list) {
      const ign = Number(v.ignition);
      const st = Number(v.standstill);
      if (ign === 1) {
        activeCount += 1;
        if (st === 0) movingCount += 1;
        else if (st === 1) stoppedCount += 1;
      } else {
        engineOffCount += 1;
      }
    }
    return { activeCount, movingCount, stoppedCount, engineOffCount };
  }, [q.data]);

  return { ...q, ...stats };
}
