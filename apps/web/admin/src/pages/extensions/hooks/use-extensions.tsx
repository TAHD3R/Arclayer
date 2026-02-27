import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { MenuProps } from "antd";
import { RotateCcw, Settings2, Trash2 } from "lucide-react";

import { getMyOrganization } from "@/api/me";
import {
  listOrganizationPlugins,
  resetOrganizationPluginConfig,
  uninstallOrganizationPlugin,
} from "@/api/org-plugins";
import { getMyWorkspaceAuthz } from "@/api/workspaces";
import {
  listWorkspacePlugins,
  resetWorkspacePluginConfig,
  uninstallWorkspacePlugin,
} from "@/api/workspace-plugins";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import type { InstalledPluginItem, PluginScope } from "../types";
import { buildCategoryTabs, getPluginRef } from "../utils";

const PAGE_SIZE = 12;

type ConfirmState = {
  open: boolean;
  type: "reset" | "uninstall" | null;
  plugin: InstalledPluginItem | null;
};

export type UseExtensionsOptions = {
  scope?: PluginScope;
  organizationId?: string;
};

export function useExtensions({ scope = "workspace", organizationId }: UseExtensionsOptions = {}) {
  const { t } = useTranslation(["plugin", "nav", "common", "settings"]);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const isOrganizationScope = scope === "organization";

  const [installOpen, setInstallOpen] = useState(false);
  const [restartHint, setRestartHint] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [officialChecked, setOfficialChecked] = useState(true);
  const [communityChecked, setCommunityChecked] = useState(true);
  const [page, setPage] = useState<number>(1);
  const [installedPage, setInstalledPage] = useState<number>(1);
  const [confirm, setConfirm] = useState<ConfirmState>({
    open: false,
    type: null,
    plugin: null,
  });

  // --- Queries ---

  const authzQuery = useQuery({
    queryKey: ["workspace", "authz", workspaceId],
    enabled: Boolean(accessToken && workspaceId && !isOrganizationScope),
    queryFn: async () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return getMyWorkspaceAuthz(workspaceId);
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const myOrganizationQuery = useQuery({
    queryKey: ["me", "organization", "plugin-center"],
    enabled: Boolean(accessToken && isOrganizationScope),
    queryFn: async () => getMyOrganization(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const canManage = useMemo(() => {
    if (isOrganizationScope) {
      const role = myOrganizationQuery.data?.membership?.role;
      return role === "owner" || role === "admin";
    }
    const codes = authzQuery.data?.permissionCodes ?? [];
    return codes.includes("system:plugins:manage") || Boolean(authzQuery.data?.isSuperuser);
  }, [
    authzQuery.data?.isSuperuser,
    authzQuery.data?.permissionCodes,
    isOrganizationScope,
    myOrganizationQuery.data?.membership?.role,
  ]);

  const effectiveOrganizationId = useMemo(() => {
    if (!isOrganizationScope) return null;
    return String(organizationId || myOrganizationQuery.data?.organization.id || "").trim() || null;
  }, [isOrganizationScope, myOrganizationQuery.data?.organization.id, organizationId]);

  const listQueryKey = useMemo(
    () =>
      isOrganizationScope
        ? (["organization", "pluginsCenter"] as const)
        : (["workspace", "pluginsCenter", workspaceId] as const),
    [isOrganizationScope, workspaceId],
  );

  const listQuery = useQuery({
    queryKey: listQueryKey,
    enabled: Boolean(accessToken && (isOrganizationScope || workspaceId)),
    queryFn: async () => {
      if (isOrganizationScope) return listOrganizationPlugins();
      if (!workspaceId) throw new Error("workspaceId is required");
      return listWorkspacePlugins(workspaceId);
    },
    staleTime: 15 * 1000,
    retry: false,
  });

  // --- Mutations ---

  const uninstallMutation = useMutation({
    mutationFn: async (plugin: InstalledPluginItem) => {
      const pluginRef = getPluginRef(plugin);
      if (isOrganizationScope) {
        await uninstallOrganizationPlugin(pluginRef);
        return;
      }
      if (!workspaceId) throw new Error("workspaceId is required");
      await uninstallWorkspacePlugin(workspaceId, pluginRef);
    },
    onSuccess: async () => {
      notifySuccessText(
        isOrganizationScope
          ? t("plugin:PLUGIN_CENTER_ORG_UNINSTALL_SUCCESS")
          : t("plugin:PLUGIN_CENTER_UNINSTALL_SUCCESS"),
      );
      await queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => notifyError(err),
  });

  const resetMutation = useMutation({
    mutationFn: async (plugin: InstalledPluginItem) => {
      const pluginRef = getPluginRef(plugin);
      if (isOrganizationScope) {
        await resetOrganizationPluginConfig(pluginRef);
        return;
      }
      if (!workspaceId) throw new Error("workspaceId is required");
      await resetWorkspacePluginConfig(workspaceId, pluginRef);
    },
    onSuccess: async () => {
      notifySuccessText(
        isOrganizationScope
          ? t("plugin:PLUGIN_CENTER_ORG_RESET_SUCCESS")
          : t("plugin:PLUGIN_CENTER_RESET_SUCCESS"),
      );
      await queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => notifyError(err),
  });

  // --- Derived data ---

  const items = useMemo(
    () => (listQuery.data?.items ?? []) as InstalledPluginItem[],
    [listQuery.data?.items],
  );

  const normalizedCategory =
    String(category || "")
      .trim()
      .toLowerCase() || "all";
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filtered = useMemo(() => {
    let out = items;
    if (normalizedCategory !== "all") {
      out = out.filter(
        (p) =>
          String(p.category || "")
            .trim()
            .toLowerCase() === normalizedCategory,
      );
    }
    if (normalizedSearch) {
      out = out.filter((p) => {
        const name = String(p.name || "").toLowerCase();
        const desc = String(p.description || "").toLowerCase();
        return name.includes(normalizedSearch) || desc.includes(normalizedSearch);
      });
    }
    return out;
  }, [items, normalizedCategory, normalizedSearch]);

  const installedItems = useMemo(
    () => items.filter((p) => Boolean(p.enabled !== undefined)),
    [items],
  );

  const filteredInstalled = useMemo(() => {
    if (!normalizedSearch) return installedItems;
    return installedItems.filter((p) => {
      const name = String(p.name || "").toLowerCase();
      const desc = String(p.description || "").toLowerCase();
      return name.includes(normalizedSearch) || desc.includes(normalizedSearch);
    });
  }, [installedItems, normalizedSearch]);

  const exploreTotal = filtered.length;
  const explorePageItems = useMemo(() => {
    const start = (Math.max(1, page) - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const installedTotal = filteredInstalled.length;
  const installedPageItems = useMemo(() => {
    const start = (Math.max(1, installedPage) - 1) * PAGE_SIZE;
    return filteredInstalled.slice(start, start + PAGE_SIZE);
  }, [filteredInstalled, installedPage]);

  const categoryTabs = useMemo(
    () => buildCategoryTabs(items, (key) => t(`plugin:${key}`)),
    [items, t],
  );

  // --- Effects ---

  useEffect(() => {
    setPage(1);
  }, [category, searchQuery]);

  useEffect(() => {
    setInstalledPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (categoryTabs.some((c) => c.key === category)) return;
    setCategory("all");
  }, [category, categoryTabs]);

  // --- Helpers ---

  function buildConfigureHref(plugin: InstalledPluginItem): string | null {
    const pluginRef = getPluginRef(plugin);
    if (isOrganizationScope) {
      return effectiveOrganizationId
        ? `/o/${encodeURIComponent(effectiveOrganizationId)}/extensions/${encodeURIComponent(pluginRef)}`
        : null;
    }
    return workspaceId ? `/w/${workspaceId}/extensions/${encodeURIComponent(pluginRef)}` : null;
  }

  function buildMenuItems(plugin: InstalledPluginItem): MenuProps["items"] {
    const configureHref = buildConfigureHref(plugin);
    if (!configureHref) return [];
    return [
      {
        key: "configure",
        label: (
          <a href={configureHref} className="block">
            {t("plugin:PLUGIN_CENTER_CONFIGURE_ACTION")}
          </a>
        ),
        icon: <Settings2 className="size-4" />,
      },
      { type: "divider" as const },
      {
        key: "reset",
        label: t("plugin:PLUGIN_CENTER_RESET_ACTION"),
        icon: <RotateCcw className="size-4" />,
        disabled: !canManage,
        danger: true,
        onClick: () => setConfirm({ open: true, type: "reset", plugin }),
      },
      {
        key: "detach",
        label: isOrganizationScope
          ? t("plugin:PLUGIN_CENTER_ORG_UNINSTALL_ACTION")
          : t("plugin:PLUGIN_CENTER_UNINSTALL_ACTION"),
        icon: <Trash2 className="size-4" />,
        disabled: !canManage,
        danger: true,
        onClick: () => setConfirm({ open: true, type: "uninstall", plugin }),
      },
    ];
  }

  function closeConfirm() {
    setConfirm({ open: false, type: null, plugin: null });
  }

  async function handleConfirm() {
    const p = confirm.plugin;
    if (!p || !confirm.type) return;
    if (confirm.type === "reset") {
      await resetMutation.mutateAsync(p);
    } else {
      await uninstallMutation.mutateAsync(p);
    }
    closeConfirm();
  }

  function handleInstalled({ requiresRestart }: { requiresRestart?: boolean }) {
    setRestartHint(Boolean(requiresRestart));
    void queryClient.invalidateQueries({
      queryKey: ["workspace", "pluginsCenter", workspaceId],
    });
  }

  return {
    t,
    isOrganizationScope,
    workspaceId,
    canManage,
    listQuery,

    // Explore tab
    categoryTabs,
    category,
    setCategory,
    searchQuery,
    setSearchQuery,
    officialChecked,
    setOfficialChecked,
    communityChecked,
    setCommunityChecked,
    explorePageItems,
    exploreTotal,
    filtered,
    page,
    setPage,
    pageSize: PAGE_SIZE,

    // Installed tab
    filteredInstalled,
    installedPageItems,
    installedTotal,
    installedPage,
    setInstalledPage,
    buildConfigureHref,
    buildMenuItems,

    // Dialogs
    installOpen,
    setInstallOpen,
    restartHint,
    confirm,
    setConfirm,
    closeConfirm,
    handleConfirm,
    handleInstalled,
    confirmLoading: resetMutation.isPending || uninstallMutation.isPending,
  };
}
