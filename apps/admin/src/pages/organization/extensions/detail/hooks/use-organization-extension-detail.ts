import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { getMyOrganization } from "@/api/me";
import {
  disableOrganizationCapability,
  enableOrganizationCapability,
  listOrganizationCapabilities,
  listOrganizationUIEmbeds,
} from "@/api/org-extensions";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { buildOrganizationPath } from "@/lib/routing/organization-routing";
import {
  organizationCapabilitiesQueryKey,
  organizationUIEmbedsQueryKey,
} from "@/lib/extensions/query-keys";

import type { ExtensionDetailPageProps } from "@/pages/_shared/extensions/components/extension-detail-page";
import type { InstalledExtensionItem } from "@/pages/_shared/extensions/types";

type UseOrganizationExtensionDetailParams = {
  organizationId: string;
  extensionRef: string;
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

function useOrganizationManageAccess() {
  const myOrganizationQuery = useQuery({
    queryKey: ["me", "organization", "extensions-detail"],
    queryFn: async () => getMyOrganization(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const role = myOrganizationQuery.data?.membership?.role;
  const canManage = role === "owner" || role === "admin";
  return { myOrganizationQuery, canManage };
}

function useOrganizationCapabilityToggle(input: {
  extension: InstalledExtensionItem | null;
  extensionRef: string;
}) {
  const { t } = useTranslation(["settings"]);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!input.extension) throw new Error("extension not found");
      return enabled
        ? enableOrganizationCapability(input.extension.capabilityId)
        : disableOrganizationCapability(input.extension.capabilityId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: organizationCapabilitiesQueryKey() });
      await queryClient.invalidateQueries({
        queryKey: organizationUIEmbedsQueryKey({
          capabilityId: input.extensionRef,
          enabledOnly: false,
        }),
      });
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    },
    onError: (err) => notifyError(err),
  });
}

export function useOrganizationExtensionDetail({
  organizationId,
  extensionRef,
}: UseOrganizationExtensionDetailParams): ExtensionDetailPageProps {
  const navigate = useNavigate();

  const { canManage } = useOrganizationManageAccess();

  const capabilitiesQuery = useQuery({
    queryKey: organizationCapabilitiesQueryKey(),
    queryFn: async () => listOrganizationCapabilities(),
    staleTime: 15 * 1000,
    retry: false,
  });

  const extension = useMemo(
    () =>
      findCapability(
        capabilitiesQuery.data?.items as InstalledExtensionItem[] | undefined,
        extensionRef,
      ),
    [capabilitiesQuery.data?.items, extensionRef],
  );

  const embedsQuery = useQuery({
    queryKey: organizationUIEmbedsQueryKey({ capabilityId: extensionRef, enabledOnly: false }),
    enabled: Boolean(extensionRef),
    queryFn: async () =>
      listOrganizationUIEmbeds({ capabilityId: extensionRef, enabledOnly: false }),
    staleTime: 15 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const toggleMutation = useOrganizationCapabilityToggle({ extension, extensionRef });

  const loading = capabilitiesQuery.isLoading && !capabilitiesQuery.data;
  const loadError = capabilitiesQuery.isError ? capabilitiesQuery.error : null;

  return {
    extensionRef,
    extension,
    loading,
    loadError,
    onRetryLoad: loadError ? () => void capabilitiesQuery.refetch() : undefined,
    onBack: () => void navigate({ to: buildOrganizationPath(organizationId, "/extensions") }),
    onToggleEnabled: async (enabled) => toggleMutation.mutateAsync(enabled),
    togglePending: toggleMutation.isPending,
    canManage,
    uiEmbeds: embedsQuery.data?.items ?? [],
    uiEmbedsLoading: embedsQuery.isLoading,
    uiEmbedsError: embedsQuery.isError ? embedsQuery.error : null,
    onRetryUIEmbeds: () => void embedsQuery.refetch(),
  };
}
