import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  disableWorkspaceCapability,
  enableWorkspaceCapability,
  listWorkspaceCapabilities,
  listWorkspaceUIEmbeds,
} from "@/api/workspace-extensions";
import { useWorkspacePermissionAccess } from "@/hooks/use-workspace-permission-access";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  workspaceCapabilitiesQueryKey,
  workspaceUIEmbedsQueryKey,
} from "@/lib/extensions/query-keys";

import type { ExtensionDetailPageProps } from "@/pages/workspaces/extensions/detail/components/extension-detail-view";
import type { InstalledExtensionItem } from "@/pages/workspaces/extensions/types";

type UseWorkspaceExtensionDetailParams = {
  workspaceId: string;
  extensionRef: string;
  backTo: string;
};

function findCapability(
  items: InstalledExtensionItem[] | undefined,
  ref: string,
): InstalledExtensionItem | null {
  const normalized = String(ref || "")
    .trim()
    .toLowerCase();
  return (
    (items ?? []).find(
      (item) =>
        String(item.capabilityId || "")
          .trim()
          .toLowerCase() === normalized,
    ) ?? null
  );
}

function useWorkspaceManageAccess(workspaceId: string) {
  const permissionAccess = useWorkspacePermissionAccess(workspaceId);
  const canManage = permissionAccess.hasPermission("system:extensions:manage");

  return { authzQuery: permissionAccess.authzQuery, canManage };
}

function useWorkspaceCapabilities(workspaceId: string) {
  const capabilitiesQuery = useQuery({
    queryKey: workspaceCapabilitiesQueryKey(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceCapabilities(workspaceId),
    staleTime: 15 * 1000,
    retry: false,
  });
  return { capabilitiesQuery };
}

function useWorkspaceUIEmbeds(workspaceId: string, extensionRef: string) {
  const embedsQuery = useQuery({
    queryKey: workspaceUIEmbedsQueryKey(workspaceId, {
      capabilityId: extensionRef,
      enabledOnly: false,
    }),
    enabled: Boolean(workspaceId && extensionRef),
    queryFn: async () =>
      listWorkspaceUIEmbeds(workspaceId, { capabilityId: extensionRef, enabledOnly: false }),
    staleTime: 15 * 1000,
    retry: false,
    meta: { silent: true },
  });
  return { embedsQuery };
}

function useWorkspaceCapabilityToggle(input: {
  workspaceId: string;
  extensionRef: string;
  extension: InstalledExtensionItem | null;
}) {
  const { t } = useTranslation(["settings"]);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!input.extension) throw new Error("extension not found");
      return enabled
        ? enableWorkspaceCapability(input.workspaceId, input.extension.capabilityId)
        : disableWorkspaceCapability(input.workspaceId, input.extension.capabilityId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: workspaceCapabilitiesQueryKey(input.workspaceId),
      });
      await queryClient.invalidateQueries({
        queryKey: workspaceUIEmbedsQueryKey(input.workspaceId, {
          capabilityId: input.extensionRef,
          enabledOnly: false,
        }),
      });
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    },
    onError: (err) => notifyError(err),
  });
}

export function useWorkspaceExtensionDetail({
  workspaceId,
  extensionRef,
  backTo,
}: UseWorkspaceExtensionDetailParams): ExtensionDetailPageProps {
  const navigate = useNavigate();

  const { canManage } = useWorkspaceManageAccess(workspaceId);
  const { capabilitiesQuery } = useWorkspaceCapabilities(workspaceId);

  const extension = useMemo(
    () =>
      findCapability(
        capabilitiesQuery.data?.items as InstalledExtensionItem[] | undefined,
        extensionRef,
      ),
    [capabilitiesQuery.data?.items, extensionRef],
  );

  const { embedsQuery } = useWorkspaceUIEmbeds(workspaceId, extensionRef);

  const toggleMutation = useWorkspaceCapabilityToggle({ workspaceId, extensionRef, extension });

  const loading = capabilitiesQuery.isLoading && !capabilitiesQuery.data;
  const loadError = capabilitiesQuery.isError ? capabilitiesQuery.error : null;

  return {
    extensionRef,
    extension,
    loading,
    loadError,
    onRetryLoad: loadError ? () => void capabilitiesQuery.refetch() : undefined,
    onBack: () => void navigate({ to: backTo }),
    onToggleEnabled: async (enabled: boolean) => toggleMutation.mutateAsync(enabled),
    togglePending: toggleMutation.isPending,
    canManage,
    uiEmbeds: embedsQuery.data?.items ?? [],
    uiEmbedsLoading: embedsQuery.isLoading,
    uiEmbedsError: embedsQuery.isError ? embedsQuery.error : null,
    onRetryUIEmbeds: () => void embedsQuery.refetch(),
  };
}
