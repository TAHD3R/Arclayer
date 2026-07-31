import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";
import type {
  BillingRedirect,
  CheckoutSessionCreate,
  CommercialAccessMemberView,
  CommercialAccessRecoveryView,
  CreditLedgerEntry,
  PageData,
  WorkspaceCommerceOverview,
  WorkspacePlanCatalog,
} from "@arclayer/openapi/admin-types";

export type {
  BillingCycle,
  BillingRedirect,
  CheckoutSessionCreate,
  CommercialAccessMemberView,
  CommercialAccessRecoveryView,
  CommercialAccessState,
  CommercePlanRevision,
  CreditLedgerEntry,
  CreditLedgerEntryType,
  CreditRefreshInterval,
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

export function getWorkspaceCommercialAccess(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<CommercialAccessMemberView> {
  return api.get<CommercialAccessMemberView>(workspacePath(workspaceId, "/commerce/access"), {
    signal,
  });
}

export function getWorkspacePaymentRecovery(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<CommercialAccessRecoveryView> {
  return api.get<CommercialAccessRecoveryView>(
    workspacePath(workspaceId, "/commerce/payment-recovery"),
    { signal },
  );
}

export function createWorkspaceCheckoutSession(
  workspaceId: string,
  payload: CheckoutSessionCreate,
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
