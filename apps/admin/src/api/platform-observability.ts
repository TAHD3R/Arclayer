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

export type HTTPRequestGroupWithPercentiles = HTTPRequestGroup & {
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
};

export type HTTPRequestGroupOrdering =
  | "-requests"
  | "-error_rate"
  | "-p95_latency_ms"
  | "-p99_latency_ms"
  | "-avg_latency_ms"
  | "-last_seen_at";

export type HTTPRequestRecordOrdering =
  | "-occurred_at"
  | "occurred_at"
  | "-duration_ms"
  | "duration_ms"
  | "-status_code";

export type HTTPRequestRecord = {
  id: string;
  occurredAt: string;
  traceId: string | null;
  actorUserId: string | null;
  actor: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  workspaceId: string | null;
  projectId: string | null;
  routeTemplate: string;
  method: string;
  statusCode: number;
  durationMs: number;
};

export type SystemObservabilityOverviewWithTailLatency = Omit<
  SystemObservabilityOverview,
  "http"
> & {
  http: SystemObservabilityOverview["http"] & {
    p95LatencyMs: number | null;
    p99LatencyMs: number | null;
  };
};

export async function getSystemObservabilityOverview(
  days: number,
): Promise<SystemObservabilityOverviewWithTailLatency> {
  return api.get<SystemObservabilityOverviewWithTailLatency>(
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
    workspaceId?: string;
    projectId?: string;
    ordering?: HTTPRequestGroupOrdering;
  },
  signal?: AbortSignal,
): Promise<PageData<HTTPRequestGroupWithPercentiles>> {
  return api.get<PageData<HTTPRequestGroupWithPercentiles>>(
    `/system/observability/request-groups${toQueryString({
      days: params.days,
      page: params.page ?? 1,
      size: params.size ?? 20,
      q: params.q,
      method: params.method,
      statusClass: params.statusClass,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      ordering: params.ordering,
    })}`,
    { signal },
  );
}

export async function listSystemHTTPRequestRecords(
  params: {
    days: number;
    page?: number;
    size?: number;
    q?: string;
    method?: string;
    statusClass?: number;
    workspaceId?: string;
    projectId?: string;
    actorUserId?: string;
    minDurationMs?: number;
    maxDurationMs?: number;
    hasError?: boolean;
    ordering?: HTTPRequestRecordOrdering;
  },
  signal?: AbortSignal,
): Promise<PageData<HTTPRequestRecord>> {
  return api.get<PageData<HTTPRequestRecord>>(
    `/system/observability/request-records${toQueryString({
      days: params.days,
      page: params.page ?? 1,
      size: params.size ?? 20,
      q: params.q,
      method: params.method,
      statusClass: params.statusClass,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
      actorUserId: params.actorUserId,
      minDurationMs: params.minDurationMs,
      maxDurationMs: params.maxDurationMs,
      hasError: params.hasError,
      ordering: params.ordering,
    })}`,
    { signal },
  );
}
