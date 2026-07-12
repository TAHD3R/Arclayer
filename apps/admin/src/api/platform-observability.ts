import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";
import type {
  ObservabilityTrendMetric,
  SystemObservabilityOverview,
  SystemObservabilityTrend,
} from "@arclayer/openapi/admin-types";

export type {
  ObservabilityPeriod,
  ObservabilityTrendMetric,
  ObservabilityTrendPoint,
  SystemObservabilityOverview,
  SystemObservabilityTrend,
} from "@arclayer/openapi/admin-types";

export type SystemObservabilityTrendMetric = ObservabilityTrendMetric;

export async function getSystemObservabilityOverview(
  days: number,
): Promise<SystemObservabilityOverview> {
  return api.get<SystemObservabilityOverview>(
    `/system/observability/overview${toQueryString({ days })}`,
  );
}

export async function getSystemObservabilityTrend(
  days: number,
  metric: SystemObservabilityTrendMetric,
): Promise<SystemObservabilityTrend> {
  return api.get<SystemObservabilityTrend>(
    `/system/observability/trends${toQueryString({ days, metric })}`,
  );
}
