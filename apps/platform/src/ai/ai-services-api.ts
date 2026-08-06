import {
  platformApplyAiPolicy,
  platformApplySystemAiProviderAvailability,
  platformCancelPlatformAiTask,
  platformCreateSystemAiProvider,
  platformDeleteSystemAiProvider,
  platformGetPlatformAiProviderReadiness,
  platformListPlatformAiTasks,
  platformListSystemAiProviders,
  platformGetAiPolicy,
  platformPreviewAiPolicy,
  platformPublishAiPolicy,
  platformSaveAiPolicyDraft,
  platformPreviewSystemAiProviderAvailability,
  platformReconcilePlatformAiTask,
  platformRetryPlatformAiTask,
  platformTestSystemAiProviderReadiness,
  platformUpdateSystemAiProvider,
  type PlatformAiProviderReadinessOut,
  type PlatformAiTaskOut,
  type PageDataPlatformAiTaskOut,
  type PlatformAiTaskActionRequest,
  type AiPolicyApplyOut,
  type AiPolicyApplyRequest,
  type AiPolicyDraftInput,
  type AiPolicyOut,
  type AiPolicyPreviewOut,
  type AiPolicyPreviewRequest,
  type AiPolicyPublishRequest,
  type AiPolicyRevisionOut,
  type SystemAiProviderCreateRequest,
  type SystemAiProviderAvailabilityPreviewOut,
  type SystemAiProviderListOut,
  type SystemAiProviderOut,
  type SystemAiProviderReadinessTestOut,
  type SystemAiProviderUpdateRequest,
  type PlatformListPlatformAiTasksData,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{ data?: ApiEnvelope<T>; error?: unknown; response?: Response }>;

export class PlatformAiServicesApiError extends Error {
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "PlatformAiServicesApiError";
    this.status = status;
  }
}

function code(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;
  const candidate = value as { error?: unknown; code?: unknown; message?: unknown };
  return code(candidate.error) ?? code(candidate.code) ?? code(candidate.message);
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined) {
    throw new PlatformAiServicesApiError(
      code(result.error) ?? "PLATFORM_AI_SERVICES_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data || result.data.error || !result.data.data) {
    throw new PlatformAiServicesApiError(
      result.data?.error ?? "PLATFORM_AI_SERVICES_RESPONSE_INVALID",
      result.response?.status,
    );
  }
  return result.data.data;
}

function unwrapVoid(result: SdkResult<unknown>): void {
  if (result.error !== undefined) {
    throw new PlatformAiServicesApiError(
      code(result.error) ?? "PLATFORM_AI_SERVICES_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data || result.data.error) {
    throw new PlatformAiServicesApiError(
      result.data?.error ?? "PLATFORM_AI_SERVICES_RESPONSE_INVALID",
      result.response?.status,
    );
  }
}

export function listAiTasks(
  query?: NonNullable<PlatformListPlatformAiTasksData["query"]>,
): Promise<PageDataPlatformAiTaskOut> {
  return platformListPlatformAiTasks({ client: platformApiClient, query }).then(unwrap);
}

export function getAiProviderReadiness(): Promise<PlatformAiProviderReadinessOut> {
  return platformGetPlatformAiProviderReadiness({ client: platformApiClient }).then(unwrap);
}

export function listAiProviders(): Promise<SystemAiProviderListOut> {
  return platformListSystemAiProviders({ client: platformApiClient }).then(unwrap);
}

export function createAiProvider(
  body: SystemAiProviderCreateRequest,
): Promise<SystemAiProviderOut> {
  return platformCreateSystemAiProvider({ client: platformApiClient, body }).then(unwrap);
}

export function updateAiProvider(
  providerId: string,
  body: SystemAiProviderUpdateRequest,
): Promise<SystemAiProviderOut> {
  return platformUpdateSystemAiProvider({
    client: platformApiClient,
    path: { provider_id: providerId },
    body,
  }).then(unwrap);
}

export function deleteAiProvider(providerId: string): Promise<void> {
  return platformDeleteSystemAiProvider({
    client: platformApiClient,
    path: { provider_id: providerId },
  }).then(unwrapVoid);
}

export function testAiProviderReadiness(
  providerId: string,
): Promise<SystemAiProviderReadinessTestOut> {
  return platformTestSystemAiProviderReadiness({
    client: platformApiClient,
    path: { provider_id: providerId },
  }).then(unwrap);
}

export function previewAiProviderAvailability(
  providerId: string,
  isActive: boolean,
): Promise<SystemAiProviderAvailabilityPreviewOut> {
  return platformPreviewSystemAiProviderAvailability({
    client: platformApiClient,
    path: { provider_id: providerId },
    body: { isActive },
  }).then(unwrap);
}

export function applyAiProviderAvailability(
  providerId: string,
  isActive: boolean,
  previewRevision: string,
): Promise<SystemAiProviderOut> {
  return platformApplySystemAiProviderAvailability({
    client: platformApiClient,
    path: { provider_id: providerId },
    body: { isActive, previewRevision },
  }).then(unwrap);
}

export function executeAiTaskAction(
  taskId: string,
  action: "retry" | "cancel" | "reconcile",
  body: PlatformAiTaskActionRequest,
): Promise<PlatformAiTaskOut> {
  const options = { client: platformApiClient, path: { task_id: taskId }, body };
  if (action === "retry") return platformRetryPlatformAiTask(options).then(unwrap);
  if (action === "cancel") return platformCancelPlatformAiTask(options).then(unwrap);
  return platformReconcilePlatformAiTask(options).then(unwrap);
}

export function getAiPolicy(): Promise<AiPolicyOut> {
  return platformGetAiPolicy({ client: platformApiClient }).then(unwrap);
}

export function saveAiPolicyDraft(body: AiPolicyDraftInput): Promise<AiPolicyRevisionOut> {
  return platformSaveAiPolicyDraft({ client: platformApiClient, body }).then(unwrap);
}

export function previewAiPolicy(body: AiPolicyPreviewRequest): Promise<AiPolicyPreviewOut> {
  return platformPreviewAiPolicy({ client: platformApiClient, body }).then(unwrap);
}

export function publishAiPolicy(body: AiPolicyPublishRequest): Promise<AiPolicyRevisionOut> {
  return platformPublishAiPolicy({ client: platformApiClient, body }).then(unwrap);
}

export function applyAiPolicy(body: AiPolicyApplyRequest): Promise<AiPolicyApplyOut> {
  return platformApplyAiPolicy({ client: platformApiClient, body }).then(unwrap);
}

export type { PlatformAiTaskOut };
