"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { MenuProps } from "antd";
import { Button, Dropdown, Pagination } from "antd";
import { MoreVertical, RotateCcw, Settings2, Trash2, Upload } from "lucide-react";

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
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { AdminExtensionsSlot } from "@/components/extensions/admin-extensions-slot";
import { PluginInstallDialog } from "@/components/plugins/plugin-install-dialog";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import { ExtensionCard } from "./extension-card";
import { ExtensionsFilterSidebar } from "./extensions-filter-sidebar";
import {
  buildCategoryTabs,
  getPluginRef,
  type InstalledPluginItem,
  type PluginScope,
} from "./helpers";

type ExtensionsPageProps = {
  scope?: PluginScope;
  organizationId?: string;
};

export function ExtensionsPage({ scope = "workspace", organizationId }: ExtensionsPageProps) {
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
  const [confirm, setConfirm] = useState<{
    open: boolean;
    type: "reset" | "uninstall" | null;
    plugin: InstalledPluginItem | null;
  }>({ open: false, type: null, plugin: null });
  const pageSize = 12;

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
      if (isOrganizationScope) {
        return listOrganizationPlugins();
      }
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
    const start = (Math.max(1, page) - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const installedTotal = filteredInstalled.length;
  const installedPageItems = useMemo(() => {
    const start = (Math.max(1, installedPage) - 1) * pageSize;
    return filteredInstalled.slice(start, start + pageSize);
  }, [filteredInstalled, installedPage, pageSize]);

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
      { type: "divider" },
      {
        key: "reset",
        label: t("plugin:PLUGIN_CENTER_RESET_ACTION"),
        icon: <RotateCcw className="size-4" />,
        disabled: !canManage,
        danger: true,
        onClick: () => {
          setConfirm({ open: true, type: "reset", plugin });
        },
      },
      {
        key: "detach",
        label: isOrganizationScope
          ? t("plugin:PLUGIN_CENTER_ORG_UNINSTALL_ACTION")
          : t("plugin:PLUGIN_CENTER_UNINSTALL_ACTION"),
        icon: <Trash2 className="size-4" />,
        disabled: !canManage,
        danger: true,
        onClick: () => {
          setConfirm({ open: true, type: "uninstall", plugin });
        },
      },
    ];
  }

  const pageTitle = t("plugin:EXTENSION_PAGE_TITLE");
  const pageDescription = t("plugin:EXTENSION_PAGE_DESC");

  // --- Early returns ---

  if (!isOrganizationScope && !workspaceId) {
    return (
      <DefaultPage title={pageTitle} description={pageDescription}>
        <ContentGuard
          loading={false}
          empty
          emptyTitle={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_TITLE")}
          emptyDescription={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_DESC")}
        />
      </DefaultPage>
    );
  }

  if (listQuery.isLoading && !listQuery.data) {
    return (
      <DefaultPage title={pageTitle} description={pageDescription}>
        <ContentGuard loading loadingVariant="masonry" />
      </DefaultPage>
    );
  }

  if (listQuery.isError) {
    return (
      <DefaultPage title={pageTitle} description={pageDescription}>
        <ContentGuard
          loading={false}
          error={listQuery.error}
          onRetry={() => void listQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  // --- Main render ---

  return (
    <DefaultPage
      width="full"
      title={pageTitle}
      description={pageDescription}
      action={
        !isOrganizationScope ? (
          <Button
            type="primary"
            icon={<Upload className="size-4" />}
            disabled={!canManage}
            onClick={() => setInstallOpen(true)}
          >
            {t("plugin:PLUGIN_CENTER_INSTALL_ACTION")}
          </Button>
        ) : undefined
      }
    >
      {/* Restart hint */}
      {!isOrganizationScope && restartHint ? (
        <div className="mb-4 rounded-lg border border-border bg-card p-4 text-body">
          {t("plugin:PLUGIN_CENTER_RESTART_HINT")}
        </div>
      ) : null}

      <ChromeTabs defaultValue="explore">
        <ChromeTabsList>
          <ChromeTabsTrigger value="explore">{t("plugin:EXTENSION_TAB_EXPLORE")}</ChromeTabsTrigger>
          <ChromeTabsTrigger value="installed">
            {t("plugin:EXTENSION_TAB_INSTALLED")}
          </ChromeTabsTrigger>
        </ChromeTabsList>

        {/* Tab content: Explore */}
        <ChromeTabsContent value="explore">
          <div className="flex gap-6">
            <ExtensionsFilterSidebar
              categories={categoryTabs}
              selectedCategory={category}
              onCategoryChange={setCategory}
              officialChecked={officialChecked}
              communityChecked={communityChecked}
              onOfficialChange={setOfficialChecked}
              onCommunityChange={setCommunityChecked}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />

            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <h3 className="text-title3 font-bold">{t("plugin:EXTENSION_EXPLORE_TITLE")}</h3>
                <p className="mt-1 text-callout text-label-secondary">
                  {t("plugin:EXTENSION_EXPLORE_DESC")}
                </p>
              </div>

              {filtered.length === 0 ? (
                <ContentGuard
                  loading={false}
                  empty
                  emptyTitle={t("common:EMPTY_TITLE")}
                  emptyDescription={t("plugin:PLUGIN_CENTER_EMPTY")}
                />
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {explorePageItems.map((p) => (
                      <ExtensionCard key={p.pluginId} plugin={p} href={buildConfigureHref(p)} />
                    ))}
                  </div>

                  {exploreTotal > pageSize ? (
                    <div className="mt-6 flex justify-end">
                      <Pagination
                        current={page}
                        pageSize={pageSize}
                        total={exploreTotal}
                        onChange={(p) => setPage(p)}
                        showSizeChanger={false}
                        showTotal={(total) => t("plugin:PLUGIN_CENTER_PAGINATION_TOTAL", { total })}
                      />
                    </div>
                  ) : null}
                </>
              )}

              <div className="mt-6">
                <AdminExtensionsSlot
                  slot="admin.plugins.center.cards"
                  title={t("nav:NAV_PLUGINS")}
                />
              </div>
            </div>
          </div>
        </ChromeTabsContent>

        {/* Tab content: Installed */}
        <ChromeTabsContent value="installed">
          <div className="flex flex-col gap-4">
            {filteredInstalled.length === 0 ? (
              <ContentGuard
                loading={false}
                empty
                emptyTitle={t("common:EMPTY_TITLE")}
                emptyDescription={t("plugin:PLUGIN_CENTER_EMPTY")}
              />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {installedPageItems.map((p) => (
                    <ExtensionCard
                      key={p.pluginId}
                      plugin={p}
                      href={buildConfigureHref(p)}
                      installed
                      actions={
                        <Dropdown trigger={["click"]} menu={{ items: buildMenuItems(p) }}>
                          <Button
                            type="text"
                            size="small"
                            icon={<MoreVertical className="size-3.5" />}
                          />
                        </Dropdown>
                      }
                    />
                  ))}
                </div>

                {installedTotal > pageSize ? (
                  <div className="mt-6 flex justify-end">
                    <Pagination
                      current={installedPage}
                      pageSize={pageSize}
                      total={installedTotal}
                      onChange={(p) => setInstalledPage(p)}
                      showSizeChanger={false}
                      showTotal={(total) => t("plugin:PLUGIN_CENTER_PAGINATION_TOTAL", { total })}
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </ChromeTabsContent>
      </ChromeTabs>

      {/* Plugin install dialog (workspace scope only) */}
      {!isOrganizationScope ? (
        <PluginInstallDialog
          workspaceId={workspaceId as string}
          open={installOpen}
          onOpenChange={setInstallOpen}
          disabled={!canManage}
          onInstalled={({ requiresRestart }) => {
            setRestartHint(Boolean(requiresRestart));
            void queryClient.invalidateQueries({
              queryKey: ["workspace", "pluginsCenter", workspaceId],
            });
          }}
        />
      ) : null}

      {/* Confirm dialog for reset / uninstall */}
      <ConfirmDialog
        open={confirm.open}
        onOpenChange={(open) =>
          setConfirm((prev) =>
            open ? { ...prev, open: true } : { open: false, type: null, plugin: null },
          )
        }
        title={
          confirm.type === "reset"
            ? isOrganizationScope
              ? t("plugin:PLUGIN_CENTER_ORG_RESET_CONFIRM_TITLE")
              : t("plugin:PLUGIN_CENTER_RESET_CONFIRM_TITLE")
            : isOrganizationScope
              ? t("plugin:PLUGIN_CENTER_ORG_UNINSTALL_CONFIRM_TITLE")
              : t("plugin:PLUGIN_CENTER_UNINSTALL_CONFIRM_TITLE")
        }
        description={
          confirm.type === "reset"
            ? isOrganizationScope
              ? t("plugin:PLUGIN_CENTER_ORG_RESET_CONFIRM_DESC", {
                  name: confirm.plugin?.name || "",
                })
              : t("plugin:PLUGIN_CENTER_RESET_CONFIRM_DESC", {
                  name: confirm.plugin?.name || "",
                })
            : isOrganizationScope
              ? t("plugin:PLUGIN_CENTER_ORG_UNINSTALL_CONFIRM_DESC", {
                  name: confirm.plugin?.name || "",
                })
              : t("plugin:PLUGIN_CENTER_UNINSTALL_CONFIRM_DESC", {
                  name: confirm.plugin?.name || "",
                })
        }
        cancelText={t("common:CANCEL")}
        confirmText={t("common:CONFIRM")}
        danger
        loading={resetMutation.isPending || uninstallMutation.isPending}
        onConfirm={async () => {
          const p = confirm.plugin;
          if (!p || !confirm.type) return;
          if (confirm.type === "reset") {
            await resetMutation.mutateAsync(p);
          } else {
            await uninstallMutation.mutateAsync(p);
          }
          setConfirm({ open: false, type: null, plugin: null });
        }}
      />
    </DefaultPage>
  );
}
