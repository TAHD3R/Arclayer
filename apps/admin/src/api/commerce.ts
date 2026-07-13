import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";
import type {
  BillingCycle,
  BillingRedirect,
  CommercePlan,
  CommercePlanUpsert,
  CreditLedgerEntry,
  PageData,
  SystemPlanCatalog,
  WorkspaceCommerceOverview,
  WorkspacePlanCatalog,
} from "@arclayer/openapi/admin-types";

export type {
  BillingCycle,
  BillingRedirect,
  CommercePlan,
  CommercePlanTier,
  CommercePlanUpsert,
  CreditLedgerEntry,
  CreditLedgerEntryType,
  CreditRefreshInterval,
  PlanFeature,
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

export function createWorkspaceCheckoutSession(
  workspaceId: string,
  payload: { planCode: string; billingInterval: BillingCycle },
): Promise<BillingRedirect> {
  return api.post<BillingRedirect>(
    workspacePath(workspaceId, "/commerce/checkout-session"),
    payload,
  );
}

export function createWorkspaceCustomerPortalSession(
  workspaceId: string,
): Promise<BillingRedirect> {
  return api.post<BillingRedirect>(
    workspacePath(workspaceId, "/commerce/customer-portal-session"),
    {},
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
