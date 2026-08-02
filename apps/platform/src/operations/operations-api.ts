import {
  platformAssignOperationalSignal,
  platformAddOperationalSignalNote,
  platformClaimOperationalSignal,
  platformGetOperationalSignal,
  platformListOperationalSignalEligibleAssignees,
  platformListOperationalSignals,
  platformMarkOperationalSignalInProgress,
  platformMarkOperationalSignalNeedsAttention,
  platformRemindOperationalSignalLater,
  type OperationalSignalAssigneeOut,
  type OperationalSignalDetailOut,
  type PageDataOperationalSignalOut,
  type PlatformListOperationalSignalsData,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiMeta = Readonly<Record<string, unknown>>;
type ApiEnvelope<T> = Readonly<{
  data?: T | null;
  error?: string | null;
  meta?: ApiMeta | null;
}>;
type SdkResult<T> = Readonly<{
  data?: ApiEnvelope<T>;
  error?: unknown;
  response?: Response;
}>;

export class PlatformOperationsApiError extends Error {
  readonly status?: number;
  readonly meta?: ApiMeta;

  constructor(code: string, status?: number, meta?: ApiMeta) {
    super(code);
    this.name = "PlatformOperationsApiError";
    this.status = status;
    this.meta = meta;
  }
}

function errorPayload(value: unknown): Readonly<{ code?: string; meta?: ApiMeta }> {
  if (typeof value === "string" && value.trim()) return { code: value };
  if (!value || typeof value !== "object") return {};
  const candidate = value as {
    error?: unknown;
    code?: unknown;
    message?: unknown;
    meta?: unknown;
  };
  const nested = errorPayload(candidate.error ?? candidate.code ?? candidate.message);
  return {
    code: nested.code,
    meta:
      candidate.meta && typeof candidate.meta === "object" && !Array.isArray(candidate.meta)
        ? (candidate.meta as ApiMeta)
        : nested.meta,
  };
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined) {
    const payload = errorPayload(result.error);
    throw new PlatformOperationsApiError(
      payload.code ?? "PLATFORM_OPERATIONS_REQUEST_FAILED",
      result.response?.status,
      payload.meta,
    );
  }
  if (!result.data || result.data.error || result.data.data == null) {
    throw new PlatformOperationsApiError(
      result.data?.error ?? "PLATFORM_OPERATIONS_RESPONSE_INVALID",
      result.response?.status,
      result.data?.meta ?? undefined,
    );
  }
  return result.data.data;
}

export type OperationalSignalListQuery = NonNullable<PlatformListOperationalSignalsData["query"]>;

export async function listOperationalSignals(
  query: OperationalSignalListQuery,
  signal?: AbortSignal,
): Promise<PageDataOperationalSignalOut> {
  return unwrap(await platformListOperationalSignals({ client: platformApiClient, query, signal }));
}

export async function getOperationalSignal(
  signalId: string,
  signal?: AbortSignal,
): Promise<OperationalSignalDetailOut> {
  return unwrap(
    await platformGetOperationalSignal({
      client: platformApiClient,
      path: { signal_id: signalId },
      signal,
    }),
  );
}

export async function listOperationalSignalEligibleAssignees(
  signal?: AbortSignal,
): Promise<OperationalSignalAssigneeOut[]> {
  return unwrap(
    await platformListOperationalSignalEligibleAssignees({
      client: platformApiClient,
      signal,
    }),
  );
}

export async function claimOperationalSignal(
  signalId: string,
  expectedRevision: number,
): Promise<OperationalSignalDetailOut> {
  return unwrap(
    await platformClaimOperationalSignal({
      client: platformApiClient,
      path: { signal_id: signalId },
      body: { expectedRevision },
    }),
  );
}

export async function assignOperationalSignal(
  signalId: string,
  assigneeUserId: string,
  expectedRevision: number,
): Promise<OperationalSignalDetailOut> {
  return unwrap(
    await platformAssignOperationalSignal({
      client: platformApiClient,
      path: { signal_id: signalId },
      body: { assigneeUserId, expectedRevision },
    }),
  );
}

export async function markOperationalSignalInProgress(
  signalId: string,
  expectedRevision: number,
): Promise<OperationalSignalDetailOut> {
  return unwrap(
    await platformMarkOperationalSignalInProgress({
      client: platformApiClient,
      path: { signal_id: signalId },
      body: { expectedRevision },
    }),
  );
}

export async function markOperationalSignalNeedsAttention(
  signalId: string,
  expectedRevision: number,
): Promise<OperationalSignalDetailOut> {
  return unwrap(
    await platformMarkOperationalSignalNeedsAttention({
      client: platformApiClient,
      path: { signal_id: signalId },
      body: { expectedRevision },
    }),
  );
}

export async function remindOperationalSignalLater(
  signalId: string,
  expectedRevision: number,
  reminderAt: string,
  reason: string,
): Promise<OperationalSignalDetailOut> {
  return unwrap(
    await platformRemindOperationalSignalLater({
      client: platformApiClient,
      path: { signal_id: signalId },
      body: { expectedRevision, reminderAt, reason },
    }),
  );
}

export async function addOperationalSignalNote(
  signalId: string,
  expectedRevision: number,
  body: string,
): Promise<OperationalSignalDetailOut> {
  return unwrap(
    await platformAddOperationalSignalNote({
      client: platformApiClient,
      path: { signal_id: signalId },
      body: { expectedRevision, body },
    }),
  );
}
