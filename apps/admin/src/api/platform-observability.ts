import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";
import type {
  AIUsageGroup,
  HTTPRequestGroup,
  ObservabilityTrendMetric,
  PageData,
  SystemObservabilityOverview,
  SystemObservabilityTrend,
} from "@arclayer/openapi/admin-types";

export type {
  AIUsageGroup,
  HTTPRequestGroup,
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

export async function listSystemAIUsageGroups(
  params: {
    days: number;
    page?: number;
    size?: number;
    q?: string;
    provider?: string;
  },
  signal?: AbortSignal,
): Promise<PageData<AIUsageGroup>> {
  return api.get<PageData<AIUsageGroup>>(
    `/system/observability/ai-usage-groups${toQueryString({
      days: params.days,
      page: params.page ?? 1,
      size: params.size ?? 20,
      q: params.q,
      provider: params.provider,
    })}`,
    { signal },
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

export async function listSystemHTTPRequestGroups(
  params: {
    days: number;
    page?: number;
    size?: number;
    q?: string;
    method?: string;
    statusClass?: number;
  },
  signal?: AbortSignal,
): Promise<PageData<HTTPRequestGroup>> {
  return api.get<PageData<HTTPRequestGroup>>(
    `/system/observability/request-groups${toQueryString({
      days: params.days,
      page: params.page ?? 1,
      size: params.size ?? 20,
      q: params.q,
      method: params.method,
      statusClass: params.statusClass,
    })}`,
    { signal },
  );
}
