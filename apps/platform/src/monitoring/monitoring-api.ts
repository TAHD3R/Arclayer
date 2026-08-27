import {
  platformGetActivityDetail,
  platformGetPlatformJob,
  platformGetPlatformJobQueues,
  platformGetPlatformObservabilityOverview,
  platformGetPlatformObservabilityTrend,
  platformGetPlatformAiRuntimeHealth,
  platformListActivity,
  platformListPlatformAiUsageGroups,
  platformListPlatformAiUsageRecords,
  platformListPlatformHttpRequestGroups,
  platformListPlatformHttpRequestRecords,
  platformListPlatformJobs,
  type AuditEventOut,
  type ObservabilityTrendOut,
  type PageDataAiUsageGroupOut,
  type PageDataAiUsageRecordOut,
  type PageDataAuditEventOut,
  type PageDataHttpRequestGroupOut,
  type PageDataHttpRequestRecordOut,
  type PageDataPlatformJobOut,
  type PlatformGetActivityDetailData,
  type PlatformGetPlatformJobData,
  type PlatformGetPlatformJobQueuesData,
  type PlatformGetPlatformObservabilityTrendData,
  type PlatformGetPlatformObservabilityOverviewData,
  type ObservabilityOverviewOut,
  type PlatformAiRuntimeHealthOut,
  type PlatformJobDetailOut,
  type PlatformJobQueuesOut,
  type PlatformListActivityData,
  type PlatformListPlatformAiUsageGroupsData,
  type PlatformListPlatformAiUsageRecordsData,
  type PlatformListPlatformHttpRequestGroupsData,
  type PlatformListPlatformHttpRequestRecordsData,
  type PlatformListPlatformJobsData,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{ data?: ApiEnvelope<T>; error?: unknown; response?: Response }>;

export class PlatformMonitoringApiError extends Error {
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "PlatformMonitoringApiError";
    this.status = status;
  }
}

function extractErrorCode(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;
  const candidate = value as { error?: unknown; code?: unknown; message?: unknown };
  return (
    extractErrorCode(candidate.error) ??
    extractErrorCode(candidate.code) ??
    extractErrorCode(candidate.message)
  );
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined) {
    throw new PlatformMonitoringApiError(
      extractErrorCode(result.error) ?? "PLATFORM_MONITORING_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data || result.data.error || !result.data.data) {
    throw new PlatformMonitoringApiError(
      result.data?.error ?? "PLATFORM_MONITORING_RESPONSE_INVALID",
      result.response?.status,
    );
  }
  return result.data.data;
}

export async function listRequestRecords(
  query: NonNullable<PlatformListPlatformHttpRequestRecordsData["query"]>,
): Promise<PageDataHttpRequestRecordOut> {
  return unwrap(await platformListPlatformHttpRequestRecords({ client: platformApiClient, query }));
}

export async function listRequestGroups(
  query: NonNullable<PlatformListPlatformHttpRequestGroupsData["query"]>,
): Promise<PageDataHttpRequestGroupOut> {
  return unwrap(await platformListPlatformHttpRequestGroups({ client: platformApiClient, query }));
}

export async function listAiUsageGroups(
  query: NonNullable<PlatformListPlatformAiUsageGroupsData["query"]>,
): Promise<PageDataAiUsageGroupOut> {
  return unwrap(await platformListPlatformAiUsageGroups({ client: platformApiClient, query }));
}

export async function listAiUsageRecords(
  query: NonNullable<PlatformListPlatformAiUsageRecordsData["query"]>,
): Promise<PageDataAiUsageRecordOut> {
  return unwrap(await platformListPlatformAiUsageRecords({ client: platformApiClient, query }));
}

export async function listActivity(
  query: NonNullable<PlatformListActivityData["query"]>,
): Promise<PageDataAuditEventOut> {
  return unwrap(await platformListActivity({ client: platformApiClient, query }));
}

export async function getActivityDetail(
  path: PlatformGetActivityDetailData["path"],
): Promise<AuditEventOut> {
  return unwrap(await platformGetActivityDetail({ client: platformApiClient, path }));
}

export async function getActivityTrend(
  query: NonNullable<PlatformGetPlatformObservabilityTrendData["query"]>,
): Promise<ObservabilityTrendOut> {
  return unwrap(await platformGetPlatformObservabilityTrend({ client: platformApiClient, query }));
}

export async function getObservabilityOverview(
  query: NonNullable<PlatformGetPlatformObservabilityOverviewData["query"]>,
): Promise<ObservabilityOverviewOut> {
  return unwrap(
    await platformGetPlatformObservabilityOverview({ client: platformApiClient, query }),
  );
}

export async function getAiRuntimeHealth(): Promise<PlatformAiRuntimeHealthOut> {
  return unwrap(await platformGetPlatformAiRuntimeHealth({ client: platformApiClient }));
}

export async function getJobQueues(
  query: NonNullable<PlatformGetPlatformJobQueuesData["query"]>,
): Promise<PlatformJobQueuesOut> {
  return unwrap(await platformGetPlatformJobQueues({ client: platformApiClient, query }));
}

export async function listJobs(
  query: NonNullable<PlatformListPlatformJobsData["query"]>,
): Promise<PageDataPlatformJobOut> {
  return unwrap(await platformListPlatformJobs({ client: platformApiClient, query }));
}

export async function getJobDetail(
  path: PlatformGetPlatformJobData["path"],
): Promise<PlatformJobDetailOut> {
  return unwrap(await platformGetPlatformJob({ client: platformApiClient, path }));
}
