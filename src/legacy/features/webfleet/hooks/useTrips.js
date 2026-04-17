/**
 * Liste paginée des trajets Webfleet (React Query).
 * @module features/webfleet/hooks/useTrips
 */

import { useQuery } from '@tanstack/react-query';
import API_BASE from '../../../config/api';
/**
 * @param {object} params
 * @param {string} [params.objectno]
 * @param {string} [params.startDate] - ISO date
 * @param {string} [params.endDate] - ISO date
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @returns {import('@tanstack/react-query').UseQueryResult}
 */
export function useTrips(params = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 25));
  const objectno = params.objectno || '';
  const startDate = params.startDate || '';
  const endDate = params.endDate || '';

  return useQuery({
    queryKey: ['webfleet-trips', objectno, startDate, endDate, page, limit],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (objectno) qs.set('objectno', objectno);
      if (startDate) qs.set('start', startDate);
      if (endDate) qs.set('end', endDate);
      const res = await fetch(`${API_BASE}/api/webfleet/trips?${qs.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      return res.json();
    },
    placeholderData: (prev) => prev,
  });
}

/**
 * Helpers de pagination à partir de la réponse API.
 * @param {object} payload - corps JSON /api/webfleet/trips
 * @returns {{ totalCount: number, totalPages: number, hasNextPage: boolean, hasPrevPage: boolean }}
 */
export function tripsPaginationMeta(payload) {
  const totalCount = Number(payload?.totalCount ?? 0);
  const totalPages = Math.max(1, Number(payload?.totalPages ?? 1));
  const page = Number(payload?.page ?? 1);
  return {
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
