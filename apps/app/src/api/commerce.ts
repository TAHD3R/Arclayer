import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";
import type {
  BillingRedirectOut as BillingRedirect,
  CheckoutSessionCreate,
  CommercialAccessMemberView,
  CommercialAccessRecoveryView,
  DomainWorkspacesListMemberCreditLimitsData,
  DomainWorkspacesListMemberCreditUsageData,
  DomainWorkspacesListWorkspaceCreditLedgerData,
  DomainWorkspacesListWorkspaceInvoicesData,
  MemberCreditConfigurationMutationOut,
  MemberCreditDefaultLimitWrite,
  MemberCreditLimitsPageOut,
  MemberCreditOverrideWrite,
  MemberCreditUsagePageOut,
  PageDataCreditLedgerOut,
  PageDataWorkspaceInvoiceOut,
  WorkspaceCommerceOverviewOut as WorkspaceCommerceOverview,
  WorkspaceAutoRefillPolicyOut,
  WorkspaceAutoRefillPolicyWrite,
  WorkspacePlanCatalogOut as WorkspacePlanCatalog,
} from "@arclayer/openapi";

type ListCreditLedgerParams = NonNullable<DomainWorkspacesListWorkspaceCreditLedgerData["query"]>;
type ListMemberCreditLimitsParams = NonNullable<
  DomainWorkspacesListMemberCreditLimitsData["query"]
>;
type ListMemberCreditUsageParams = NonNullable<DomainWorkspacesListMemberCreditUsageData["query"]>;
type ListWorkspaceInvoicesParams = NonNullable<DomainWorkspacesListWorkspaceInvoicesData["query"]>;
type MemberCreditCommandMetadata = Pick<
  MemberCreditDefaultLimitWrite,
  "expectedRevision" | "idempotencyKey"
>;

type CreditLedgerPage = Omit<PageDataCreditLedgerOut, "items"> & {
  items: NonNullable<PageDataCreditLedgerOut["items"]>;
};

export type MemberCreditLimitsPage = Omit<MemberCreditLimitsPageOut, "items"> & {
  items: NonNullable<MemberCreditLimitsPageOut["items"]>;
};

export type MemberCreditUsagePage = Omit<MemberCreditUsagePageOut, "items"> & {
  items: NonNullable<MemberCreditUsagePageOut["items"]>;
};

export type WorkspaceInvoicePage = Omit<PageDataWorkspaceInvoiceOut, "items"> & {
  items: NonNullable<PageDataWorkspaceInvoiceOut["items"]>;
};

export type MemberCreditLimitInput =
  | Readonly<{ limitKind: "limited"; limitCredits: number }>
  | Readonly<{ limitKind: "unlimited"; limitCredits: null }>;

export type WorkspaceDefaultMemberCreditLimitCommand = MemberCreditCommandMetadata &
  MemberCreditLimitInput;

export type WorkspaceMemberCreditOverrideCommand =
  | (MemberCreditCommandMetadata & MemberCreditLimitInput & Readonly<{ action: "set" }>)
  | (MemberCreditCommandMetadata & Readonly<{ action: "clear" }>);

function requireCreditLedgerPage(page: PageDataCreditLedgerOut): CreditLedgerPage {
  if (!Array.isArray(page.items)) {
    throw new Error("Invalid credit ledger pagination response");
  }
  return { ...page, items: page.items };
}

function requireMemberCreditLimitsPage(page: MemberCreditLimitsPageOut): MemberCreditLimitsPage {
  if (!Array.isArray(page.items)) {
    throw new Error("Invalid member credit limits pagination response");
  }
  return { ...page, items: page.items };
}

function requireMemberCreditUsagePage(page: MemberCreditUsagePageOut): MemberCreditUsagePage {
  if (!Array.isArray(page.items)) {
    throw new Error("Invalid member credit usage pagination response");
  }
  return { ...page, items: page.items };
}

function requireWorkspaceInvoicePage(page: PageDataWorkspaceInvoiceOut): WorkspaceInvoicePage {
  if (!Array.isArray(page.items)) {
    throw new Error("Invalid workspace invoice pagination response");
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
  MemberCreditConfigurationMutationOut,
  MemberCreditLimitItemOut,
  MemberCreditLimitOut,
  MemberCreditUsageItemOut,
  WorkspaceCommerceOverviewOut as WorkspaceCommerceOverview,
  WorkspacePlanCatalogOut as WorkspacePlanCatalog,
  WorkspacePlanOptionOut as WorkspacePlanOption,
  WorkspaceAutoRefillPolicyOut as WorkspaceAutoRefillPolicy,
  WorkspaceAutoRefillPolicyWrite as WorkspaceAutoRefillPolicyCommand,
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
    {
      signal,
    },
  );
}

export function getWorkspaceAutoRefillPolicy(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<WorkspaceAutoRefillPolicyOut> {
  return api.get<WorkspaceAutoRefillPolicyOut>(
    workspacePath(workspaceId, "/commerce/auto-refill"),
    {
      signal,
    },
  );
}

export function updateWorkspaceAutoRefillPolicy(
  workspaceId: string,
  payload: WorkspaceAutoRefillPolicyWrite,
): Promise<WorkspaceAutoRefillPolicyOut> {
  return api.put<WorkspaceAutoRefillPolicyOut>(
    workspacePath(workspaceId, "/commerce/auto-refill"),
    payload,
  );
}

export function createWorkspaceCheckoutSession(
  workspaceId: string,
  payload: CheckoutSessionCreate,
  idempotencyKey: string,
): Promise<BillingRedirect> {
  return api.post<BillingRedirect>(
    workspacePath(workspaceId, "/commerce/checkout-session"),
    payload,
    { headers: { "Idempotency-Key": idempotencyKey } },
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

export async function listWorkspaceMemberCreditUsage(
  workspaceId: string,
  params: ListMemberCreditUsageParams = {},
  signal?: AbortSignal,
): Promise<MemberCreditUsagePage> {
  const query = toQueryString({ page: params.page ?? 1, size: params.size ?? 20 });
  const page = await api.get<MemberCreditUsagePageOut>(
    workspacePath(workspaceId, `/commerce/member-usage${query}`),
    { signal },
  );
  return requireMemberCreditUsagePage(page);
}

export async function listWorkspaceInvoices(
  workspaceId: string,
  params: ListWorkspaceInvoicesParams = {},
  signal?: AbortSignal,
): Promise<WorkspaceInvoicePage> {
  const query = toQueryString({ page: params.page ?? 1, size: params.size ?? 20 });
  const page = await api.get<PageDataWorkspaceInvoiceOut>(
    workspacePath(workspaceId, `/commerce/invoices${query}`),
    { signal },
  );
  return requireWorkspaceInvoicePage(page);
}

export async function listWorkspaceMemberCreditLimits(
  workspaceId: string,
  params: ListMemberCreditLimitsParams = {},
  signal?: AbortSignal,
): Promise<MemberCreditLimitsPage> {
  const query = toQueryString({ page: params.page ?? 1, size: params.size ?? 20 });
  const page = await api.get<MemberCreditLimitsPageOut>(
    workspacePath(workspaceId, `/commerce/member-limits${query}`),
    { signal },
  );
  return requireMemberCreditLimitsPage(page);
}

export function setWorkspaceDefaultMemberCreditLimit(
  workspaceId: string,
  payload: WorkspaceDefaultMemberCreditLimitCommand,
): Promise<MemberCreditConfigurationMutationOut> {
  const body: MemberCreditDefaultLimitWrite = { ...payload };
  return api.put<MemberCreditConfigurationMutationOut>(
    workspacePath(workspaceId, "/commerce/member-limits/default"),
    body,
  );
}

export function setWorkspaceMemberCreditOverride(
  workspaceId: string,
  membershipId: string,
  payload: WorkspaceMemberCreditOverrideCommand,
): Promise<MemberCreditConfigurationMutationOut> {
  const body: MemberCreditOverrideWrite =
    payload.action === "clear"
      ? {
          action: "clear",
          expectedRevision: payload.expectedRevision,
          idempotencyKey: payload.idempotencyKey,
        }
      : { ...payload };
  return api.put<MemberCreditConfigurationMutationOut>(
    workspacePath(
      workspaceId,
      `/commerce/member-limits/${encodeURIComponent(String(membershipId))}`,
    ),
    body,
  );
}
