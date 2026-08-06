import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createWorkspaceCustomerPortalSession,
  getWorkspaceAutoRefillLifecycle,
  getWorkspaceAutoRefillPolicy,
  getWorkspacePaymentRecovery,
  listWorkspaceInvoices,
  updateWorkspaceAutoRefillPolicy,
  listWorkspaceMemberCreditLimits,
  setWorkspaceDefaultMemberCreditLimit,
  type MemberCreditLimitInput,
  type MemberCreditLimitsPage,
  type WorkspaceAutoRefillPolicyCommand,
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
  const [autoRefillFeedback, setAutoRefillFeedback] = useState<"idle" | "saved" | "error">("idle");
  const attemptRef = useRef<DefaultLimitAttempt | null>(null);
  const autoRefillAttemptRef = useRef<Readonly<{
    fingerprint: string;
    idempotencyKey: string;
  }> | null>(null);

  const limitsQuery = useQuery({
    queryKey: memberCreditConfigurationQueryKey(workspaceId),
    queryFn: ({ signal }) =>
      listWorkspaceMemberCreditLimits(workspaceId, { page: 1, size: 1 }, signal),
    enabled: access.canManageCommerce,
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });

  const recoveryQuery = useQuery({
    queryKey: ["workspace-commerce", workspaceId, "payment-recovery"],
    queryFn: ({ signal }) => getWorkspacePaymentRecovery(workspaceId, signal),
    enabled: access.canManageCommerce,
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });

  const invoicesQuery = useQuery({
    queryKey: ["workspace-commerce", workspaceId, "invoices"],
    queryFn: ({ signal }) => listWorkspaceInvoices(workspaceId, { page: 1, size: 20 }, signal),
    enabled: access.canManageCommerce,
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });

  const autoRefillQuery = useQuery({
    queryKey: ["workspace-commerce", workspaceId, "auto-refill"],
    queryFn: ({ signal }) => getWorkspaceAutoRefillPolicy(workspaceId, signal),
    enabled: access.canManageCommerce,
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });

  const autoRefillLifecycleQuery = useQuery({
    queryKey: ["workspace-commerce", workspaceId, "auto-refill-lifecycle"],
    queryFn: ({ signal }) => getWorkspaceAutoRefillLifecycle(workspaceId, signal),
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

  const autoRefillMutation = useMutation({
    retry: false,
    mutationFn: async (command: WorkspaceAutoRefillPolicyCommand) => {
      const result = await updateWorkspaceAutoRefillPolicy(workspaceId, command);
      if (
        result.workspaceId !== workspaceId ||
        !Number.isSafeInteger(result.revision) ||
        result.revision < command.expectedRevision ||
        !Array.isArray(result.availableOffers)
      ) {
        throw new ApiError({
          status: 500,
          error: "PRODUCT_API_RESPONSE_INVALID",
          message: "Automatic refill returned invalid workspace scope",
        });
      }
      return result;
    },
    onSuccess: async () => {
      autoRefillAttemptRef.current = null;
      setAutoRefillFeedback("saved");
      await queryClient.invalidateQueries({
        queryKey: ["workspace-commerce", workspaceId, "auto-refill"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["workspace-commerce", workspaceId, "auto-refill-lifecycle"],
      });
    },
    onError: () => setAutoRefillFeedback("error"),
  });

  const saveAutoRefill = useCallback(
    async (command: Omit<WorkspaceAutoRefillPolicyCommand, "idempotencyKey">) => {
      const fingerprint = JSON.stringify(command);
      const currentAttempt = autoRefillAttemptRef.current;
      const idempotencyKey =
        currentAttempt?.fingerprint === fingerprint
          ? currentAttempt.idempotencyKey
          : globalThis.crypto.randomUUID();
      autoRefillAttemptRef.current = { fingerprint, idempotencyKey };
      setAutoRefillFeedback("idle");
      await autoRefillMutation.mutateAsync({ ...command, idempotencyKey });
    },
    [autoRefillMutation],
  );

  return {
    overviewQuery: access.overviewQuery,
    limitsQuery,
    recoveryQuery,
    invoicesQuery,
    autoRefillQuery,
    autoRefillLifecycleQuery,
    managementAccessStatus: access.managementAccessStatus,
    canManageCommerce: access.canManageCommerce,
    permissionError: access.error,
    retryPermission: access.retry,
    billingPortalMutation,
    defaultLimitFeedback,
    defaultLimitPending: defaultLimitMutation.isPending,
    saveDefaultLimit,
    clearDefaultLimitFeedback: () => setDefaultLimitFeedback("idle"),
    autoRefillFeedback,
    autoRefillPending: autoRefillMutation.isPending,
    saveAutoRefill,
    clearAutoRefillFeedback: () => setAutoRefillFeedback("idle"),
  };
}
