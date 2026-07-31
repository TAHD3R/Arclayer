import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  assignWorkspaceFeatureAccess,
  readWorkspaceFeatureAccess,
  revokeWorkspaceFeatureAccess,
  type FeatureAccessAllocationOut,
  type FeatureAccessCapabilityProjection,
  type FeatureAccessReadResult,
} from "@/api/feature-access";
import { getWorkspaceCommercialAccess } from "@/api/commerce";
import { ApiError } from "@/lib/http";
import type { TeamMember } from "@arclayer/openapi/admin-types";
import type { MemberFeatureAccessView } from "./components/member-feature-access-dialog";

type FeatureAccessActionState = "hidden" | "loading" | "error" | "view" | "manage";
type FeatureAccessCommand = Readonly<{
  action: "assign" | "revoke";
  entitlementKey: string;
  membershipId: string;
  expectedRevision: number;
  idempotencyKey: string;
}>;

const queryKey = (workspaceId: string | null) => ["feature-access", workspaceId] as const;

function projectionOf(capabilities: readonly FeatureAccessCapabilityProjection[]) {
  const projections = new Set(capabilities.map((capability) => capability.projection));
  return projections.size === 1 ? (capabilities[0]?.projection ?? null) : null;
}

function updateCapability(
  capability: FeatureAccessCapabilityProjection,
  allocation: FeatureAccessAllocationOut,
): FeatureAccessCapabilityProjection {
  if (capability.entitlementKey !== allocation.featureKey || capability.projection !== "manager") {
    return capability;
  }
  return {
    ...capability,
    assignedCount: allocation.assignedCount,
    assignedMembershipIds: allocation.assignedMembershipIds,
    availableCount: allocation.availableCount,
    capacity: allocation.capacity,
    revision: allocation.revision,
  };
}

function applyAllocation(
  current: FeatureAccessReadResult | undefined,
  allocation: FeatureAccessAllocationOut,
): FeatureAccessReadResult | undefined {
  if (!current) return current;
  return {
    ...current,
    capabilities: current.capabilities.map((capability) =>
      updateCapability(capability, allocation),
    ),
  };
}

function memberLabel(member: TeamMember, fallback: string): string {
  return member.displayName || member.username || member.email || fallback;
}

export function useMemberFeatureAccess(args: {
  workspaceId: string | null;
  currentUserId: string | null;
}) {
  const { t, i18n } = useTranslation(["featureAccess"]);
  const queryClient = useQueryClient();
  const [selectedMember, setSelectedMember] = React.useState<TeamMember | null>(null);
  const [changeError, setChangeError] = React.useState<"conflict" | "failure" | null>(null);

  const featureQuery = useQuery({
    queryKey: queryKey(args.workspaceId),
    enabled: Boolean(args.workspaceId),
    queryFn: ({ signal }) => readWorkspaceFeatureAccess(String(args.workspaceId), signal),
    retry: false,
    staleTime: 30 * 1000,
    meta: { silent: true },
  });
  const commercialAccessQuery = useQuery({
    queryKey: ["commerce", "workspace", args.workspaceId, "access"],
    enabled: Boolean(args.workspaceId),
    queryFn: ({ signal }) => getWorkspaceCommercialAccess(String(args.workspaceId), signal),
    retry: false,
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  const capabilities = featureQuery.data?.capabilities ?? [];
  const projection = projectionOf(capabilities);
  const metadataReady = capabilities.every(
    (capability) =>
      i18n.exists(capability.metadata.nameI18NKey) &&
      i18n.exists(capability.metadata.descriptionI18NKey) &&
      (capability.capacity.kind !== "limited" || capability.availableCount != null),
  );
  const contractInvalid = capabilities.length > 0 && (!projection || !metadataReady);
  const paymentRestricted = commercialAccessQuery.data?.state === "payment_restricted";
  const assignmentStateKnown = commercialAccessQuery.isSuccess;

  const refetchCurrentAccess = React.useCallback(() => {
    void featureQuery.refetch();
  }, [featureQuery]);

  const mutation = useMutation({
    retry: false,
    mutationFn: async (command: FeatureAccessCommand) => {
      if (!args.workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return command.action === "assign"
        ? assignWorkspaceFeatureAccess(
            args.workspaceId,
            command.entitlementKey,
            {
              membershipId: command.membershipId,
              expectedRevision: command.expectedRevision,
            },
            command.idempotencyKey,
          )
        : revokeWorkspaceFeatureAccess(
            args.workspaceId,
            command.entitlementKey,
            command.membershipId,
            command.expectedRevision,
            command.idempotencyKey,
          );
    },
    onSuccess: (result, command) => {
      const allocation = result.allocation;
      const responseMatchesCommand =
        allocation.workspaceId === args.workspaceId &&
        allocation.featureKey === command.entitlementKey &&
        result.operation === command.action;
      if (!responseMatchesCommand) {
        setChangeError("failure");
        refetchCurrentAccess();
        return;
      }
      queryClient.setQueryData<FeatureAccessReadResult>(queryKey(args.workspaceId), (current) =>
        applyAllocation(current, allocation),
      );
      setChangeError(null);
    },
    onError: (error) => {
      setChangeError(error instanceof ApiError && error.status === 409 ? "conflict" : "failure");
      refetchCurrentAccess();
    },
  });

  const actionStateFor = React.useCallback(
    (member: TeamMember): FeatureAccessActionState => {
      if (member.membershipStatus !== "active") return "hidden";
      if (featureQuery.isLoading) return "loading";
      if (featureQuery.isError || contractInvalid) return "error";
      if (capabilities.length === 0) return "hidden";
      if (projection === "manager") return "manage";
      return String(member.userId) === args.currentUserId ? "view" : "hidden";
    },
    [
      args.currentUserId,
      capabilities.length,
      contractInvalid,
      featureQuery.isError,
      featureQuery.isLoading,
      projection,
    ],
  );

  const selectedItems = React.useMemo<readonly MemberFeatureAccessView[]>(() => {
    if (!selectedMember || contractInvalid) return [];
    return capabilities.map((capability) => {
      const assigned =
        capability.projection === "manager"
          ? capability.assignedMembershipIds.includes(selectedMember.membershipId)
          : capability.currentMembershipAssigned;
      const capacity =
        capability.capacity.kind === "limited"
          ? ({
              kind: "limited",
              assignedCount: capability.assignedCount,
              limit: capability.capacity.limit,
              availableCount: capability.availableCount!,
            } as const)
          : ({ kind: "unlimited", assignedCount: capability.assignedCount } as const);
      const assignUnavailableReason = !assignmentStateKnown
        ? "temporarily-unavailable"
        : paymentRestricted
          ? "payment-recovery"
          : capability.capacity.kind === "limited" && capability.availableCount === 0
            ? "capacity"
            : null;
      return {
        id: capability.entitlementKey,
        name: t(capability.metadata.nameI18NKey),
        description: t(capability.metadata.descriptionI18NKey),
        capacity,
        assigned,
        change:
          capability.projection !== "manager"
            ? null
            : assigned
              ? { action: "revoke", availability: { status: "available" } }
              : assignUnavailableReason
                ? {
                    action: "assign",
                    availability: { status: "unavailable", reason: assignUnavailableReason },
                  }
                : { action: "assign", availability: { status: "available" } },
      } satisfies MemberFeatureAccessView;
    });
  }, [assignmentStateKnown, capabilities, contractInvalid, paymentRestricted, selectedMember, t]);

  const submitChange = React.useCallback(
    (item: MemberFeatureAccessView, action: "assign" | "revoke") => {
      const capability = capabilities.find((entry) => entry.entitlementKey === item.id);
      if (!selectedMember || capability?.projection !== "manager") {
        setChangeError("failure");
        return;
      }
      setChangeError(null);
      mutation.mutate({
        action,
        entitlementKey: capability.entitlementKey,
        membershipId: selectedMember.membershipId,
        expectedRevision: capability.revision,
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
    },
    [capabilities, mutation, selectedMember],
  );

  const openForMember = React.useCallback(
    (member: TeamMember) => {
      setChangeError(null);
      mutation.reset();
      setSelectedMember(member);
    },
    [mutation],
  );

  return {
    actionStateFor,
    openForMember,
    dialogProps: {
      open: Boolean(selectedMember),
      onOpenChange: (open: boolean) => {
        if (!open) setSelectedMember(null);
      },
      memberName: selectedMember
        ? memberLabel(selectedMember, t("featureAccess:MEMBER_FALLBACK"))
        : "",
      canManage: projection === "manager",
      items: selectedItems.map((item) => ({
        ...item,
        change: item.change
          ? {
              ...item.change,
              pending:
                mutation.isPending &&
                mutation.variables?.entitlementKey === item.id &&
                mutation.variables.membershipId === selectedMember?.membershipId,
            }
          : null,
      })),
      loading: featureQuery.isLoading,
      loadError: featureQuery.isError || contractInvalid,
      changeError,
      paymentRecoveryLimited: paymentRestricted,
      onRetry: refetchCurrentAccess,
      onAssign: (item: MemberFeatureAccessView) => submitChange(item, "assign"),
      onRevoke: (item: MemberFeatureAccessView) => submitChange(item, "revoke"),
    },
  } as const;
}
