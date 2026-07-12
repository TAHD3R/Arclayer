import { useQuery } from "@tanstack/react-query";

import {
  getSystemObservabilityOverview,
  getSystemObservabilityTrend,
  type SystemObservabilityTrendMetric,
} from "@/api/platform-observability";

const QUERY_OPTIONS = {
  staleTime: 30_000,
  retry: false,
  meta: { silent: true },
} as const;

export function useSystemObservabilityOverview(days: number) {
  return useQuery({
    queryKey: ["system", "observability", "overview", days] as const,
    queryFn: () => getSystemObservabilityOverview(days),
    ...QUERY_OPTIONS,
  });
}

export function useSystemObservabilityTrend(days: number, metric: SystemObservabilityTrendMetric) {
  return useQuery({
    queryKey: ["system", "observability", "trend", metric, days] as const,
    queryFn: () => getSystemObservabilityTrend(days, metric),
    ...QUERY_OPTIONS,
  });
}
