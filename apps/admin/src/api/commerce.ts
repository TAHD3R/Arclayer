import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";
import type {
  BillingCycle,
  CommercePlan,
  CommercePlanUpsert,
  CreditLedgerEntry,
  PageData,
  SubscriptionChangeRequest,
  SystemPlanCatalog,
  WorkspaceCommerceOverview,
  WorkspacePlanCatalog,
} from "@arclayer/openapi/admin-types";

export type {
  BillingCycle,
  CommercePlan,
  CommercePlanTier,
  CommercePlanUpsert,
  CreditLedgerEntry,
  CreditLedgerEntryType,
  CreditRefreshInterval,
  PlanFeature,
  SubscriptionChangeRequest,
  SubscriptionStatus,
  SystemPlanCatalog,
  WorkspaceCommerceOverview,
  WorkspacePlanCatalog,
  WorkspacePlanOption,
} from "@arclayer/openapi/admin-types";

export function getWorkspaceCommerceOverview(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspaceCommerceOverview> {
  return api.get<WorkspaceCommerceOverview>(workspacePath(workspaceId, "/commerce/overview"), {
    signal,
  });
}

export function listWorkspaceCommercePlans(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspacePlanCatalog> {
  return api.get<WorkspacePlanCatalog>(workspacePath(workspaceId, "/commerce/plans"), {
    signal,
  });
}

export function requestWorkspacePlanChange(
  workspaceId: string,
  payload: { planCode: string; billingInterval: BillingCycle; reason?: string },
): Promise<SubscriptionChangeRequest> {
  return api.post<SubscriptionChangeRequest>(
    workspacePath(workspaceId, "/commerce/subscription-change-requests"),
    payload,
  );
}

export function listWorkspaceCreditLedger(
  workspaceId: string,
  params: { page?: number; size?: number } = {},
  signal?: AbortSignal,
): Promise<PageData<CreditLedgerEntry>> {
  const query = toQueryString({ page: params.page ?? 1, size: params.size ?? 20 });
  return api.get<PageData<CreditLedgerEntry>>(
    workspacePath(workspaceId, `/commerce/credits/ledger${query}`),
    { signal },
  );
}

export function listSystemCommercePlans(
  includeInactive = true,
  signal?: AbortSignal,
): Promise<SystemPlanCatalog> {
  return api.get<SystemPlanCatalog>(`/system/commerce/plans${toQueryString({ includeInactive })}`, {
    signal,
  });
}

export function upsertSystemCommercePlan(
  code: string,
  payload: CommercePlanUpsert,
): Promise<CommercePlan> {
  return api.put<CommercePlan>(`/system/commerce/plans/${encodeURIComponent(code)}`, payload);
}

export function listSystemSubscriptionChangeRequests(
  params: {
    status?: SubscriptionChangeRequest["status"];
    page?: number;
    size?: number;
  } = {},
  signal?: AbortSignal,
): Promise<PageData<SubscriptionChangeRequest>> {
  const query = toQueryString({
    status: params.status,
    page: params.page ?? 1,
    size: params.size ?? 20,
  });
  return api.get<PageData<SubscriptionChangeRequest>>(
    `/system/commerce/subscription-change-requests${query}`,
    { signal },
  );
}

export function approveSystemSubscriptionChangeRequest(
  requestId: string,
  reviewNote: string,
): Promise<SubscriptionChangeRequest> {
  return api.post<SubscriptionChangeRequest>(
    `/system/commerce/subscription-change-requests/${encodeURIComponent(requestId)}/approve`,
    { reviewNote: reviewNote.trim() || undefined },
  );
}

export function rejectSystemSubscriptionChangeRequest(
  requestId: string,
  reviewNote: string,
): Promise<SubscriptionChangeRequest> {
  return api.post<SubscriptionChangeRequest>(
    `/system/commerce/subscription-change-requests/${encodeURIComponent(requestId)}/reject`,
    { reviewNote: reviewNote.trim() },
  );
}
