import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createWorkspaceCustomerPortalSession,
  getWorkspaceCommerceOverview,
  listWorkspaceMemberCreditLimits,
  setWorkspaceDefaultMemberCreditLimit,
  type MemberCreditLimitInput,
  type MemberCreditLimitsPage,
} from "@/api/commerce";
import { useWorkspacePermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ApiError } from "@/lib/http";
import { notifyError } from "@/lib/notifications";

const WORKSPACE_COMMERCE_MANAGE_PERMISSION = "workspace:commerce:manage";
const WORKSPACE_ROLES_FEATURE_KEY = "workspace.roles.manage";
export const MEMBER_CREDIT_USAGE_TABLE_ID = "workspace-plan-usage-member-credits";

type ManagementAccessStatus = "loading" | "error" | "view" | "manage";
type DefaultLimitFeedback = "idle" | "saved" | "conflict" | "error";
type DefaultLimitAttempt = Readonly<{
  fingerprint: string;
  idempotencyKey: string;
}>;
type DefaultLimitMutationCommand = Readonly<{
  input: MemberCreditLimitInput;
  expectedRevision: number;
  idempotencyKey: string;
}>;

const memberLimitsQueryKey = (workspaceId: string) =>
  ["commerce", "workspace", workspaceId, "member-limits", "configuration"] as const;

function includesWorkspaceRoleManagement(
  entitlements: ReadonlyArray<{ key: string; isIncluded: boolean }>,
): boolean {
  const matches = entitlements.filter(
    (entitlement) => entitlement.key === WORKSPACE_ROLES_FEATURE_KEY,
  );
  return matches.length === 1 && matches[0]?.isIncluded === true;
}

function commandFingerprint(command: Omit<DefaultLimitMutationCommand, "idempotencyKey">): string {
  return JSON.stringify({
    expectedRevision: command.expectedRevision,
    limitKind: command.input.limitKind,
    limitCredits: command.input.limitCredits,
  });
}

function isMemberCreditConflict(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    (error.error === "WORKSPACE_MEMBER_CREDIT_REVISION_STALE" ||
      error.error === "WORKSPACE_MEMBER_CREDIT_IDEMPOTENCY_CONFLICT")
  );
}

export function usePlanUsageController(workspaceId: string) {
  const queryClient = useQueryClient();
  const permissionAccess = useWorkspacePermissionAccess(workspaceId);
  const [defaultLimitFeedback, setDefaultLimitFeedback] = useState<DefaultLimitFeedback>("idle");
  const attemptRef = useRef<DefaultLimitAttempt | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["commerce", "workspace", workspaceId, "overview"],
    queryFn: ({ signal }) => getWorkspaceCommerceOverview(workspaceId, signal),
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });
  const rolesManagementIncluded = includesWorkspaceRoleManagement(
    overviewQuery.data?.planRevision.entitlements ?? [],
  );
  const isWorkspaceOwner = Boolean(permissionAccess.authzQuery.data?.isWorkspaceOwner);
  const canManageCommerce =
    permissionAccess.authzQuery.isSuccess &&
    (isWorkspaceOwner ||
      permissionAccess.isSuperuser ||
      (rolesManagementIncluded &&
        permissionAccess.hasPermission(WORKSPACE_COMMERCE_MANAGE_PERMISSION)));

  const managementAccessStatus: ManagementAccessStatus = permissionAccess.authzQuery.isPending
    ? "loading"
    : permissionAccess.authzQuery.isError
      ? "error"
      : canManageCommerce
        ? "manage"
        : "view";

  const limitsQuery = useQuery({
    queryKey: memberLimitsQueryKey(workspaceId),
    queryFn: ({ signal }) =>
      listWorkspaceMemberCreditLimits(workspaceId, { page: 1, size: 1 }, signal),
    enabled: canManageCommerce,
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });

  const refreshMemberCreditViews = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: memberLimitsQueryKey(workspaceId) }),
      queryClient.invalidateQueries({
        queryKey: ["dataTable", MEMBER_CREDIT_USAGE_TABLE_ID],
      }),
    ]);
  }, [queryClient, workspaceId]);

  const defaultLimitMutation = useMutation({
    retry: false,
    mutationFn: async (command: DefaultLimitMutationCommand) => {
      const result = await setWorkspaceDefaultMemberCreditLimit(workspaceId, {
        ...command.input,
        expectedRevision: command.expectedRevision,
        idempotencyKey: command.idempotencyKey,
      });
      if (result.workspaceId !== workspaceId || result.membershipId !== null) {
        throw new ApiError({
          status: 500,
          error: "PRODUCT_API_RESPONSE_INVALID",
          message: "Default member Credit limit returned invalid scope",
        });
      }
      return result;
    },
    onSuccess: async (result) => {
      attemptRef.current = null;
      setDefaultLimitFeedback("saved");
      queryClient.setQueryData<MemberCreditLimitsPage>(
        memberLimitsQueryKey(workspaceId),
        (current) =>
          current
            ? {
                ...current,
                configurationRevision: result.configurationRevision,
                defaultLimit: result.defaultLimit,
              }
            : current,
      );
      await refreshMemberCreditViews();
    },
    onError: async (error) => {
      if (isMemberCreditConflict(error)) {
        attemptRef.current = null;
        setDefaultLimitFeedback("conflict");
        await refreshMemberCreditViews();
        return;
      }
      setDefaultLimitFeedback("error");
    },
  });

  const saveDefaultLimit = useCallback(
    async (input: MemberCreditLimitInput) => {
      const expectedRevision = limitsQuery.data?.configurationRevision;
      if (expectedRevision == null) {
        throw new Error("Member Credit configuration is unavailable");
      }
      const fingerprint = commandFingerprint({ input, expectedRevision });
      const currentAttempt = attemptRef.current;
      const idempotencyKey =
        currentAttempt?.fingerprint === fingerprint
          ? currentAttempt.idempotencyKey
          : globalThis.crypto.randomUUID();
      attemptRef.current = { fingerprint, idempotencyKey };
      setDefaultLimitFeedback("idle");
      await defaultLimitMutation.mutateAsync({ input, expectedRevision, idempotencyKey });
    },
    [defaultLimitMutation, limitsQuery.data?.configurationRevision],
  );

  const billingPortalMutation = useMutation({
    retry: false,
    mutationFn: () => createWorkspaceCustomerPortalSession(workspaceId),
    onSuccess: (redirect) => window.location.assign(redirect.url),
    onError: notifyError,
  });

  return {
    overviewQuery,
    limitsQuery,
    managementAccessStatus,
    canManageCommerce,
    permissionError: permissionAccess.authzQuery.error,
    retryPermission: permissionAccess.authzQuery.refetch,
    billingPortalMutation,
    defaultLimitFeedback,
    defaultLimitPending: defaultLimitMutation.isPending,
    saveDefaultLimit,
    clearDefaultLimitFeedback: () => setDefaultLimitFeedback("idle"),
  };
}
