import {
  platformCommerceAdjustWorkspaceCredits,
  platformCommerceCancelSubscriptionRevisionTransition,
  platformCommerceCreateCommercePlan,
  platformCommerceCreatePlanRevision,
  platformCommerceGetCommerceDunningPolicy,
  platformCommerceGetCommerceProvider,
  platformCommerceGetCommerceSimulator,
  platformCommerceGetSimulatedCommerceState,
  platformCommerceGetPlatformCommerceSubscription,
  platformCommerceGetWorkspaceCommerceOverview,
  platformCommerceListCommercePlans,
  platformCommerceListCommercePlanRevisions,
  platformCommerceListCommerceProviderEvents,
  platformCommerceListPlatformCommerceInvoices,
  platformCommerceListPlatformCommerceRefunds,
  platformCommerceListPlatformCommerceSubscriptions,
  platformCommerceListPlatformCommerceTransactions,
  platformCommercePreviewSubscriptionRevisionTransition,
  platformCommercePublishPlanRevision,
  platformCommercePutCommerceDunningPolicy,
  platformCommercePutCommerceProvider,
  platformCommerceReconcileCommerceProviderEvent,
  platformCommerceScheduleSubscriptionRevisionTransition,
  platformCommerceSubmitSimulatedCheckoutOutcome,
  platformCommerceSubmitSimulatedTopUpOutcome,
  platformCommerceUpdatePlanRevision,
  type CommercialCorrectionApplyPayload,
  type CommercialCorrectionPreviewRequest,
  type ConvergencePreviewRequest,
  type CreditAdjustmentRequest,
  type DunningPolicyWrite,
  type PlatformCommerceListCommercePlansData,
  type PlatformCommerceListCommerceProviderEventsData,
  type PlatformCommerceListPlatformCommerceSubscriptionsData,
  type PlatformCommerceListPlatformCommerceInvoicesData,
  type PlatformCommerceListPlatformCommerceRefundsData,
  type PlatformCommerceListPlatformCommerceTransactionsData,
  type PlanIdentityCreate,
  type PlanRevisionDraftCreate,
  type PlanRevisionDraftUpdate,
  type PlanRevisionPublish,
  type ProviderConfigurationWriteWritable,
  type ProviderEventReconcileRequest,
  type SimulatedCheckoutOutcomeWrite,
  type PlatformCommercePlanCatalogOut,
  type PlatformCommerceSubscriptionListOut,
  type PlatformInvoiceListOut,
  type PlatformRefundListOut,
  type PlatformTransactionListOut,
  type RenewalTransitionScheduleRequest,
  type SubscriptionTransitionCancelRequest,
} from "@arclayer/platform-openapi";

import { platformApiClient } from "@/api/client";

type ApiEnvelope<T> = Readonly<{ data?: T | null; error?: string | null }>;
type SdkResult<T> = Readonly<{ data?: ApiEnvelope<T>; error?: unknown; response?: Response }>;

export class PlatformCommerceApiError extends Error {
  readonly status?: number;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "PlatformCommerceApiError";
    this.status = status;
  }
}

function errorCode(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;
  const candidate = value as { error?: unknown; code?: unknown; message?: unknown };
  return errorCode(candidate.error) ?? errorCode(candidate.code) ?? errorCode(candidate.message);
}

function unwrap<T>(result: SdkResult<T>): T {
  if (result.error !== undefined) {
    throw new PlatformCommerceApiError(
      errorCode(result.error) ?? "PLATFORM_COMMERCE_REQUEST_FAILED",
      result.response?.status,
    );
  }
  if (!result.data || result.data.error || !result.data.data) {
    throw new PlatformCommerceApiError(
      result.data?.error ?? "PLATFORM_COMMERCE_RESPONSE_INVALID",
      result.response?.status,
    );
  }
  return result.data.data;
}

export async function listCommercePlans(
  query?: NonNullable<PlatformCommerceListCommercePlansData["query"]>,
): Promise<PlatformCommercePlanCatalogOut> {
  return unwrap(await platformCommerceListCommercePlans({ client: platformApiClient, query }));
}

export async function listCommerceSubscriptions(
  query?: NonNullable<PlatformCommerceListPlatformCommerceSubscriptionsData["query"]>,
): Promise<PlatformCommerceSubscriptionListOut> {
  return unwrap(
    await platformCommerceListPlatformCommerceSubscriptions({
      client: platformApiClient,
      query,
    }),
  );
}

export async function listCommerceTransactions(
  query?: NonNullable<PlatformCommerceListPlatformCommerceTransactionsData["query"]>,
): Promise<PlatformTransactionListOut> {
  return unwrap(
    await platformCommerceListPlatformCommerceTransactions({
      client: platformApiClient,
      query,
    }),
  );
}

export async function listCommerceInvoices(
  query?: NonNullable<PlatformCommerceListPlatformCommerceInvoicesData["query"]>,
): Promise<PlatformInvoiceListOut> {
  return unwrap(
    await platformCommerceListPlatformCommerceInvoices({
      client: platformApiClient,
      query,
    }),
  );
}

export async function listCommerceRefunds(
  query?: NonNullable<PlatformCommerceListPlatformCommerceRefundsData["query"]>,
): Promise<PlatformRefundListOut> {
  return unwrap(
    await platformCommerceListPlatformCommerceRefunds({
      client: platformApiClient,
      query,
    }),
  );
}

export async function createCommercePlan(body: PlanIdentityCreate, idempotencyKey: string) {
  return unwrap(
    await platformCommerceCreateCommercePlan({
      body,
      client: platformApiClient,
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  );
}

export async function listCommercePlanRevisions(code: string, includeInactive = true) {
  return unwrap(
    await platformCommerceListCommercePlanRevisions({
      client: platformApiClient,
      path: { code },
      query: { includeInactive },
    }),
  );
}

export async function createPlanRevision(
  code: string,
  body: PlanRevisionDraftCreate,
  idempotencyKey: string,
) {
  return unwrap(
    await platformCommerceCreatePlanRevision({
      body,
      client: platformApiClient,
      headers: { "Idempotency-Key": idempotencyKey },
      path: { code },
    }),
  );
}

export async function updatePlanRevision(
  code: string,
  revisionId: string,
  body: PlanRevisionDraftUpdate,
  idempotencyKey: string,
) {
  return unwrap(
    await platformCommerceUpdatePlanRevision({
      body,
      client: platformApiClient,
      headers: { "Idempotency-Key": idempotencyKey },
      path: { code, revision_id: revisionId },
    }),
  );
}

export async function publishPlanRevision(
  code: string,
  revisionId: string,
  body: PlanRevisionPublish,
  idempotencyKey: string,
) {
  return unwrap(
    await platformCommercePublishPlanRevision({
      body,
      client: platformApiClient,
      headers: { "Idempotency-Key": idempotencyKey },
      path: { code, revision_id: revisionId },
    }),
  );
}

export async function getCommerceProvider() {
  return unwrap(await platformCommerceGetCommerceProvider({ client: platformApiClient }));
}

export async function getCommerceSimulator() {
  return unwrap(await platformCommerceGetCommerceSimulator({ client: platformApiClient }));
}

export async function getSimulatedCommerceState(workspaceId: string) {
  return unwrap(
    await platformCommerceGetSimulatedCommerceState({
      client: platformApiClient,
      path: { workspace_id: workspaceId },
    }),
  );
}

export async function submitSimulatedCheckoutOutcome(
  workspaceId: string,
  checkoutSessionId: string,
  body: SimulatedCheckoutOutcomeWrite,
  idempotencyKey: string,
) {
  return unwrap(
    await platformCommerceSubmitSimulatedCheckoutOutcome({
      body,
      client: platformApiClient,
      headers: { "Idempotency-Key": idempotencyKey },
      path: { workspace_id: workspaceId, checkout_session_id: checkoutSessionId },
    }),
  );
}

export async function submitSimulatedTopUpOutcome(
  workspaceId: string,
  checkoutSessionId: string,
  body: SimulatedCheckoutOutcomeWrite,
  idempotencyKey: string,
) {
  return unwrap(
    await platformCommerceSubmitSimulatedTopUpOutcome({
      body,
      client: platformApiClient,
      headers: { "Idempotency-Key": idempotencyKey },
      path: { workspace_id: workspaceId, checkout_session_id: checkoutSessionId },
    }),
  );
}

export async function putCommerceProvider(body: ProviderConfigurationWriteWritable) {
  return unwrap(await platformCommercePutCommerceProvider({ body, client: platformApiClient }));
}

export async function getCommerceDunningPolicy() {
  return unwrap(await platformCommerceGetCommerceDunningPolicy({ client: platformApiClient }));
}

export async function putCommerceDunningPolicy(body: DunningPolicyWrite) {
  return unwrap(
    await platformCommercePutCommerceDunningPolicy({ body, client: platformApiClient }),
  );
}

export async function listCommerceProviderEvents(
  query?: NonNullable<PlatformCommerceListCommerceProviderEventsData["query"]>,
) {
  return unwrap(
    await platformCommerceListCommerceProviderEvents({ client: platformApiClient, query }),
  );
}

export async function reconcileCommerceProviderEvent(
  eventId: string,
  body: ProviderEventReconcileRequest,
) {
  return unwrap(
    await platformCommerceReconcileCommerceProviderEvent({
      body,
      client: platformApiClient,
      path: { event_id: eventId },
    }),
  );
}

export async function getCommerceSubscription(subscriptionId: string) {
  return unwrap(
    await platformCommerceGetPlatformCommerceSubscription({
      client: platformApiClient,
      path: { subscription_id: subscriptionId },
    }),
  );
}

export async function getWorkspaceCommerceOverview(workspaceId: string) {
  return unwrap(
    await platformCommerceGetWorkspaceCommerceOverview({
      client: platformApiClient,
      path: { workspace_id: workspaceId },
    }),
  );
}

export async function adjustWorkspaceCredits(workspaceId: string, body: CreditAdjustmentRequest) {
  return unwrap(
    await platformCommerceAdjustWorkspaceCredits({
      body,
      client: platformApiClient,
      path: { workspace_id: workspaceId },
    }),
  );
}

export async function previewSubscriptionRevisionTransition(body: ConvergencePreviewRequest) {
  return unwrap(
    await platformCommercePreviewSubscriptionRevisionTransition({
      body,
      client: platformApiClient,
    }),
  );
}

export async function scheduleSubscriptionRevisionTransition(
  body: RenewalTransitionScheduleRequest,
) {
  return unwrap(
    await platformCommerceScheduleSubscriptionRevisionTransition({
      body,
      client: platformApiClient,
    }),
  );
}

export async function cancelSubscriptionRevisionTransition(
  transitionId: string,
  body: SubscriptionTransitionCancelRequest,
) {
  return unwrap(
    await platformCommerceCancelSubscriptionRevisionTransition({
      body,
      client: platformApiClient,
      path: { transition_id: transitionId },
    }),
  );
}

// These request types are deliberately exported for form boundaries only. The server currently
// returns COMMERCIAL_CORRECTION_PROVIDER_PORT_UNAVAILABLE for both correction operations.
export type CommerceCorrectionPreviewRequest = CommercialCorrectionPreviewRequest;
export type CommerceCorrectionApplyPayload = CommercialCorrectionApplyPayload;
