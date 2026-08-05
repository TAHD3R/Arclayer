import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listWorkspaceMemberCreditLimits,
  setWorkspaceMemberCreditOverride,
  type MemberCreditConfigurationMutationOut,
  type MemberCreditLimitInput,
  type MemberCreditLimitItemOut,
  type MemberCreditLimitOut,
  type MemberCreditLimitsPage,
} from "@/api/commerce";
import { useWorkspaceCommerceManagementAccess } from "@/hooks/use-workspace-commerce-management-access";
import { ApiError } from "@/lib/http";
import {
  isMemberCreditConflict,
  isValidMemberCreditLimit,
  MEMBER_CREDIT_PAGE_SIZE,
  memberCreditLimitsEqual,
  memberCreditConfigurationQueryKey,
  memberCreditLimitsQueryKey,
  peopleMemberCreditUsageQueryKey,
  planMemberCreditUsageQueryKey,
} from "@/lib/commerce/member-credit-contracts";

export type MemberCreditOverrideInput =
  | Readonly<{ action: "clear" }>
  | (Readonly<{ action: "set" }> & MemberCreditLimitInput);

export type MemberCreditOverrideFeedback = "idle" | "saved" | "conflict" | "error";

export type MemberCreditLimitsCollection = Readonly<{
  configurationRevision: number;
  defaultLimit: MemberCreditLimitOut;
  periodStart: string;
  periodEnd: string;
  items: readonly MemberCreditLimitItemOut[];
}>;

type MemberCreditOverrideAttempt = Readonly<{
  fingerprint: string;
  idempotencyKey: string;
}>;

type MemberCreditOverrideMutationCommand = Readonly<{
  membershipId: string;
  input: MemberCreditOverrideInput;
  expectedRevision: number;
  idempotencyKey: string;
}>;

export async function listAllWorkspaceMemberCreditLimits(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<MemberCreditLimitsCollection> {
  const items: MemberCreditLimitItemOut[] = [];
  const membershipIds = new Set<string>();
  const seenPages = new Set<number>();
  let page: number | null = 1;
  let snapshot: Omit<MemberCreditLimitsCollection, "items"> | null = null;
  let total: number | null = null;

  while (page !== null) {
    if (seenPages.has(page)) throw new Error("Member Credit limits pagination repeated a page");
    seenPages.add(page);
    const result = await listWorkspaceMemberCreditLimits(
      workspaceId,
      { page, size: MEMBER_CREDIT_PAGE_SIZE },
      signal,
    );
    const currentSnapshot = {
      configurationRevision: result.configurationRevision,
      defaultLimit: result.defaultLimit,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
    };
    if (snapshot === null) {
      snapshot = currentSnapshot;
      total = result.total;
    } else if (
      snapshot.configurationRevision !== currentSnapshot.configurationRevision ||
      snapshot.periodStart !== currentSnapshot.periodStart ||
      snapshot.periodEnd !== currentSnapshot.periodEnd ||
      !memberCreditLimitsEqual(snapshot.defaultLimit, currentSnapshot.defaultLimit) ||
      total !== result.total
    ) {
      throw new Error("Member Credit limits pagination returned an inconsistent snapshot");
    }
    for (const item of result.items) {
      if (membershipIds.has(item.membershipId)) {
        throw new Error("Member Credit limits pagination returned a duplicate membership");
      }
      membershipIds.add(item.membershipId);
      items.push(item);
    }
    page = result.next ?? null;
  }

  if (snapshot === null || total === null || items.length !== total) {
    throw new Error("Member Credit limits pagination returned an incomplete snapshot");
  }
  return { ...snapshot, items };
}

function commandFingerprint(command: Omit<MemberCreditOverrideMutationCommand, "idempotencyKey">) {
  return JSON.stringify({
    membershipId: command.membershipId,
    action: command.input.action,
    expectedRevision: command.expectedRevision,
    limitKind: command.input.action === "set" ? command.input.limitKind : null,
    limitCredits: command.input.action === "set" ? command.input.limitCredits : null,
  });
}

function requireValidMutationResult(
  workspaceId: string,
  command: MemberCreditOverrideMutationCommand,
  result: MemberCreditConfigurationMutationOut,
) {
  const expectedOverride: MemberCreditLimitOut | null =
    command.input.action === "clear"
      ? null
      : {
          limitKind: command.input.limitKind,
          limitCredits: command.input.limitCredits,
        };
  const expectedEffective = expectedOverride ?? result.defaultLimit;
  if (
    result.workspaceId !== workspaceId ||
    result.membershipId !== command.membershipId ||
    !Number.isSafeInteger(result.configurationRevision) ||
    result.configurationRevision <= command.expectedRevision ||
    !isValidMemberCreditLimit(result.defaultLimit) ||
    !isValidMemberCreditLimit(result.overrideLimit) ||
    !isValidMemberCreditLimit(result.effectiveLimit) ||
    !memberCreditLimitsEqual(result.overrideLimit, expectedOverride) ||
    !memberCreditLimitsEqual(result.effectiveLimit, expectedEffective)
  ) {
    throw new ApiError({
      status: 500,
      error: "PRODUCT_API_RESPONSE_INVALID",
      message: "Member Credit override returned invalid configuration state",
    });
  }
  return result;
}

export function useMemberCreditLimitOverrides(workspaceId: string | null | undefined) {
  const normalizedWorkspaceId = workspaceId ? String(workspaceId) : null;
  const queryClient = useQueryClient();
  const access = useWorkspaceCommerceManagementAccess(normalizedWorkspaceId);
  const [feedback, setFeedback] = useState<MemberCreditOverrideFeedback>("idle");
  const attemptsRef = useRef(new Map<string, MemberCreditOverrideAttempt>());

  const query = useQuery({
    queryKey: memberCreditLimitsQueryKey(normalizedWorkspaceId ?? "unselected"),
    enabled: Boolean(normalizedWorkspaceId && access.canManageCommerce),
    queryFn: ({ signal }) => {
      if (!normalizedWorkspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return listAllWorkspaceMemberCreditLimits(normalizedWorkspaceId, signal);
    },
    retry: false,
    staleTime: 30_000,
    meta: { silent: true },
  });
  const byMembershipId = useMemo(
    () => new Map((query.data?.items ?? []).map((item) => [item.membershipId, item])),
    [query.data?.items],
  );

  const refresh = useCallback(async () => {
    if (!normalizedWorkspaceId) return;
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: memberCreditLimitsQueryKey(normalizedWorkspaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: memberCreditConfigurationQueryKey(normalizedWorkspaceId),
      }),
      queryClient.invalidateQueries({
        queryKey: peopleMemberCreditUsageQueryKey(normalizedWorkspaceId),
      }),
      queryClient.invalidateQueries({ queryKey: planMemberCreditUsageQueryKey() }),
    ]);
  }, [normalizedWorkspaceId, queryClient]);

  const mutation = useMutation({
    retry: false,
    mutationFn: async (command: MemberCreditOverrideMutationCommand) => {
      if (!normalizedWorkspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      const result = await setWorkspaceMemberCreditOverride(
        normalizedWorkspaceId,
        command.membershipId,
        {
          ...command.input,
          expectedRevision: command.expectedRevision,
          idempotencyKey: command.idempotencyKey,
        },
      );
      return requireValidMutationResult(normalizedWorkspaceId, command, result);
    },
    onSuccess: async (result, command) => {
      if (!normalizedWorkspaceId) return;
      attemptsRef.current.delete(command.membershipId);
      setFeedback("saved");
      queryClient.setQueryData<MemberCreditLimitsCollection>(
        memberCreditLimitsQueryKey(normalizedWorkspaceId),
        (current) =>
          current
            ? {
                ...current,
                configurationRevision: result.configurationRevision,
                defaultLimit: result.defaultLimit,
                items: current.items.map((item) =>
                  item.membershipId === command.membershipId
                    ? {
                        ...item,
                        overrideLimit: result.overrideLimit,
                        effectiveLimit: result.effectiveLimit,
                      }
                    : item,
                ),
              }
            : current,
      );
      queryClient.setQueryData<MemberCreditLimitsPage>(
        memberCreditConfigurationQueryKey(normalizedWorkspaceId),
        (current) =>
          current
            ? {
                ...current,
                configurationRevision: result.configurationRevision,
                defaultLimit: result.defaultLimit,
              }
            : current,
      );
      await refresh();
    },
    onError: async (error, command) => {
      if (isMemberCreditConflict(error)) {
        attemptsRef.current.delete(command.membershipId);
        setFeedback("conflict");
        await refresh();
        return;
      }
      setFeedback("error");
    },
  });

  const saveOverride = useCallback(
    async (membershipId: string, input: MemberCreditOverrideInput) => {
      const expectedRevision = query.data?.configurationRevision;
      if (expectedRevision == null || !byMembershipId.has(membershipId)) {
        throw new Error("Member Credit configuration is unavailable");
      }
      const command = { membershipId, input, expectedRevision };
      const fingerprint = commandFingerprint(command);
      const currentAttempt = attemptsRef.current.get(membershipId);
      const idempotencyKey =
        currentAttempt?.fingerprint === fingerprint
          ? currentAttempt.idempotencyKey
          : globalThis.crypto.randomUUID();
      attemptsRef.current.set(membershipId, { fingerprint, idempotencyKey });
      setFeedback("idle");
      await mutation.mutateAsync({ ...command, idempotencyKey });
    },
    [byMembershipId, mutation, query.data?.configurationRevision],
  );

  return {
    access,
    query,
    byMembershipId,
    feedback,
    pending: mutation.isPending,
    saveOverride,
    clearFeedback: () => setFeedback("idle"),
    refresh,
  } as const;
}
