import type { MemberCreditLimitOut } from "@/api/commerce";
import { ApiError } from "@/lib/http";

export const WORKSPACE_COMMERCE_MANAGE_PERMISSION = "workspace:commerce:manage";
export const WORKSPACE_ROLES_FEATURE_KEY = "workspace.roles.manage";
export const MEMBER_CREDIT_PAGE_SIZE = 200;
export const MEMBER_CREDIT_USAGE_TABLE_ID = "workspace-plan-usage-member-credits";

export const workspaceCommerceOverviewQueryKey = (workspaceId: string) =>
  ["commerce", "workspace", workspaceId, "overview"] as const;

export const memberCreditConfigurationQueryKey = (workspaceId: string) =>
  ["commerce", "workspace", workspaceId, "member-limits", "configuration"] as const;

export const memberCreditLimitsQueryKey = (workspaceId: string) =>
  ["commerce", "workspace", workspaceId, "member-limits", "all"] as const;

export const peopleMemberCreditUsageQueryKey = (workspaceId: string) =>
  ["commerce", "workspace", workspaceId, "member-usage", "people"] as const;

export const planMemberCreditUsageQueryKey = () =>
  ["dataTable", MEMBER_CREDIT_USAGE_TABLE_ID] as const;

export function memberCreditLimitsEqual(
  left: MemberCreditLimitOut | null,
  right: MemberCreditLimitOut | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.limitKind === right.limitKind && left.limitCredits === right.limitCredits;
}

export function isValidMemberCreditLimit(value: unknown): value is MemberCreditLimitOut | null {
  if (value === null) return true;
  if (typeof value !== "object" || value === undefined) return false;
  const candidate = value as Partial<MemberCreditLimitOut>;
  if (candidate.limitKind === "unlimited") return candidate.limitCredits === null;
  return (
    candidate.limitKind === "limited" &&
    Number.isSafeInteger(candidate.limitCredits) &&
    Number(candidate.limitCredits) > 0
  );
}

export function includesWorkspaceRoleManagement(
  entitlements: ReadonlyArray<{ key: string; isIncluded: boolean }>,
): boolean {
  const matches = entitlements.filter(
    (entitlement) => entitlement.key === WORKSPACE_ROLES_FEATURE_KEY,
  );
  return matches.length === 1 && matches[0]?.isIncluded === true;
}

export function isMemberCreditConflict(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    (error.error === "WORKSPACE_MEMBER_CREDIT_REVISION_STALE" ||
      error.error === "WORKSPACE_MEMBER_CREDIT_IDEMPOTENCY_CONFLICT")
  );
}
