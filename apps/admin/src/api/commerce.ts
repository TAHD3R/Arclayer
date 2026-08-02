import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";
import type {
  BillingRedirectOut as BillingRedirect,
  CheckoutSessionCreate,
  CommercialAccessMemberView,
  CommercialAccessRecoveryView,
  WorkspaceCommerceOverviewOut as WorkspaceCommerceOverview,
  WorkspacePlanCatalogOut as WorkspacePlanCatalog,
  PageDataCreditLedgerOut,
  DomainWorkspacesListWorkspaceCreditLedgerData,
} from "@arclayer/openapi";

type ListCreditLedgerParams = NonNullable<DomainWorkspacesListWorkspaceCreditLedgerData["query"]>;

type CreditLedgerPage = Omit<PageDataCreditLedgerOut, "items"> & {
  items: NonNullable<PageDataCreditLedgerOut["items"]>;
};

function requireCreditLedgerPage(page: PageDataCreditLedgerOut): CreditLedgerPage {
  if (!Array.isArray(page.items)) {
    throw new Error("Invalid credit ledger pagination response");
  }
  return { ...page, items: page.items };
}

export type {
  BillingCycle,
  BillingRedirectOut as BillingRedirect,
  CheckoutSessionCreate,
  CommercialAccessMemberView,
  CommercialAccessRecoveryView,
  CommercialAccessState,
  CommercePlanRevisionOut as CommercePlanRevision,
  CreditLedgerOut as CreditLedgerEntry,
  CreditLedgerEntryType,
  CreditRefreshInterval,
  WorkspaceCommerceOverviewOut as WorkspaceCommerceOverview,
  WorkspacePlanCatalogOut as WorkspacePlanCatalog,
  WorkspacePlanOptionOut as WorkspacePlanOption,
} from "@arclayer/openapi";

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

export async function listWorkspaceCreditLedger(
  workspaceId: string,
  params: ListCreditLedgerParams = {},
  signal?: AbortSignal,
): Promise<CreditLedgerPage> {
  const query = toQueryString({ page: params.page ?? 1, size: params.size ?? 20 });
  const page = await api.get<PageDataCreditLedgerOut>(
    workspacePath(workspaceId, `/commerce/credits/ledger${query}`),
    { signal },
  );
  return requireCreditLedgerPage(page);
}
