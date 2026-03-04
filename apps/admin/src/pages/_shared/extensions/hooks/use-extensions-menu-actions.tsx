import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings2, CircleOff } from "lucide-react";

import { disableOrganizationCapability } from "@/api/org-extensions";
import { disableWorkspaceCapability } from "@/api/workspace-extensions";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import type { ExtensionMenuItem, ExtensionScope, InstalledExtensionItem } from "../types";
import { getExtensionRef } from "../utils";

function useDisableCapabilityMutation(input: {
  isOrganizationScope: boolean;
  workspaceId: string | null;
  listQueryKey: readonly unknown[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (extension: InstalledExtensionItem) => {
      const ref = getExtensionRef(extension);
      if (input.isOrganizationScope) return disableOrganizationCapability(ref);
      if (!input.workspaceId) throw new Error("workspaceId is required");
      return disableWorkspaceCapability(input.workspaceId, ref);
    },
    onSuccess: async () => {
      notifySuccessText(input.t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({ queryKey: input.listQueryKey });
    },
    onError: (err) => notifyError(err),
  });
}

function buildInstalledMenuItems(input: {
  canManage: boolean;
  configureHref: string | null;
  disablePending: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
  onDisable: () => void;
}): ExtensionMenuItem[] {
  return [
    {
      key: "configure",
      label: input.t("plugin:PLUGIN_CENTER_CONFIGURE_ACTION"),
      icon: <Settings2 className="size-4" />,
      onClick: () => {
        if (!input.configureHref) return;
        window.location.assign(input.configureHref);
      },
    },
    { key: "divider", type: "divider" as const, label: "" },
    {
      key: "disable",
      label: input.t("settings:SETTINGS_DISABLED"),
      icon: <CircleOff className="size-4" />,
      disabled: !input.canManage || input.disablePending,
      danger: true,
      onClick: input.onDisable,
    },
  ];
}

export function useExtensionsMenuActions(input: {
  scope: ExtensionScope;
  workspaceId: string | null;
  organizationId: string | null;
  canManage: boolean;
  listQueryKey: readonly unknown[];
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const isOrganizationScope = input.scope === "organization";

  const disableMutation = useDisableCapabilityMutation({
    isOrganizationScope,
    workspaceId: input.workspaceId,
    listQueryKey: input.listQueryKey,
    t: input.t,
  });

  const buildConfigureHref = (extension: InstalledExtensionItem): string | null => {
    const extensionRef = getExtensionRef(extension);
    if (isOrganizationScope) {
      return input.organizationId
        ? `/o/${encodeURIComponent(input.organizationId)}/extensions/${encodeURIComponent(extensionRef)}`
        : null;
    }
    return input.workspaceId
      ? `/w/${input.workspaceId}/extensions/${encodeURIComponent(extensionRef)}`
      : null;
  };

  const buildMenuItems = (extension: InstalledExtensionItem): ExtensionMenuItem[] => {
    const configureHref = buildConfigureHref(extension);
    const disable = () => void disableMutation.mutateAsync(extension);
    return buildInstalledMenuItems({
      canManage: input.canManage,
      configureHref,
      disablePending: disableMutation.isPending,
      t: input.t,
      onDisable: disable,
    });
  };

  return { buildConfigureHref, buildMenuItems };
}
