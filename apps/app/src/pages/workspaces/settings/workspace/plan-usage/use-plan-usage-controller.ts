import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createWorkspaceCustomerPortalSession,
  listWorkspaceMemberCreditLimits,
  setWorkspaceDefaultMemberCreditLimit,
  type MemberCreditLimitInput,
  type MemberCreditLimitsPage,
} from "@/api/commerce";
import { useWorkspaceCommerceManagementAccess } from "@/hooks/use-workspace-commerce-management-access";
import { ApiError } from "@/lib/http";
import {
  isMemberCreditConflict,
  isValidMemberCreditLimit,
  memberCreditConfigurationQueryKey,
  memberCreditLimitsEqual,
  memberCreditLimitsQueryKey,
  peopleMemberCreditUsageQueryKey,
  planMemberCreditUsageQueryKey,
} from "@/lib/commerce/member-credit-contracts";
import { notifyError } from "@/lib/notifications";

export { MEMBER_CREDIT_USAGE_TABLE_ID } from "@/lib/commerce/member-credit-contracts";

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

function commandFingerprint(command: Omit<DefaultLimitMutationCommand, "idempotencyKey">): string {
  return JSON.stringify({
    expectedRevision: command.expectedRevision,
    limitKind: command.input.limitKind,
    limitCredits: command.input.limitCredits,
  });
}

export function usePlanUsageController(workspaceId: string) {
  const queryClient = useQueryClient();
  const access = useWorkspaceCommerceManagementAccess(workspaceId);
  const [defaultLimitFeedback, setDefaultLimitFeedback] = useState<DefaultLimitFeedback>("idle");
  const attemptRef = useRef<DefaultLimitAttempt | null>(null);

  const limitsQuery = useQuery({
    queryKey: memberCreditConfigurationQueryKey(workspaceId),
    queryFn: ({ signal }) =>
      listWorkspaceMemberCreditLimits(workspaceId, { page: 1, size: 1 }, signal),
    enabled: access.canManageCommerce,
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });

  const refreshMemberCreditViews = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: memberCreditConfigurationQueryKey(workspaceId),
      }),
      queryClient.invalidateQueries({ queryKey: memberCreditLimitsQueryKey(workspaceId) }),
      queryClient.invalidateQueries({
        queryKey: peopleMemberCreditUsageQueryKey(workspaceId),
      }),
      queryClient.invalidateQueries({ queryKey: planMemberCreditUsageQueryKey() }),
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
      if (
        result.workspaceId !== workspaceId ||
        result.membershipId !== null ||
        !Number.isSafeInteger(result.configurationRevision) ||
        result.configurationRevision <= command.expectedRevision ||
        !isValidMemberCreditLimit(result.defaultLimit) ||
        result.overrideLimit !== null ||
        !isValidMemberCreditLimit(result.effectiveLimit) ||
        !memberCreditLimitsEqual(result.defaultLimit, command.input) ||
        !memberCreditLimitsEqual(result.effectiveLimit, command.input)
      ) {
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
        memberCreditConfigurationQueryKey(workspaceId),
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
    overviewQuery: access.overviewQuery,
    limitsQuery,
    managementAccessStatus: access.managementAccessStatus,
    canManageCommerce: access.canManageCommerce,
    permissionError: access.error,
    retryPermission: access.retry,
    billingPortalMutation,
    defaultLimitFeedback,
    defaultLimitPending: defaultLimitMutation.isPending,
    saveDefaultLimit,
    clearDefaultLimitFeedback: () => setDefaultLimitFeedback("idle"),
  };
}
