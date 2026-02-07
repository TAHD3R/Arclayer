"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { MenuProps } from "antd";
import { Button, Card, Dropdown, Pagination, Select, Switch, Tag, Typography } from "antd";
import { MoreVertical, RotateCcw, Settings2, Trash2, Upload } from "lucide-react";

import { getMyOrganization } from "@/api/me";
import {
  disableOrganizationPlugin,
  enableOrganizationPlugin,
  getOrganizationPluginSettings,
  listOrganizationPlugins,
  patchOrganizationPluginSettings,
  type OrganizationPluginItem,
} from "@/api/org-plugins";
import { getMyWorkspaceAuthz } from "@/api/workspaces";
import type { WorkspacePluginItem } from "@/api/workspace-plugins";
import {
  disableWorkspacePlugin,
  enableWorkspacePlugin,
  listWorkspacePlugins,
  resetWorkspacePluginConfig,
  uninstallWorkspacePlugin,
} from "@/api/workspace-plugins";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { AdminExtensionsSlot } from "@/components/extensions/admin-extensions-slot";
import { PluginIcon } from "@/components/plugins/plugin-icon";
import { PluginInstallDialog } from "@/components/plugins/plugin-install-dialog";
import { PluginSettingsForm } from "@/components/plugins/plugin-settings-form";
import {
  ChromeTabs,
  ChromeTabsBar,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

function normalizeStatus(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function statusColor(status: string): string | undefined {
  const s = normalizeStatus(status);
  if (s === "started") return "green";
  if (s === "installed") return "blue";
  if (s === "disabled") return undefined;
  if (s === "failed") return "red";
  return undefined;
}

type PluginScope = "workspace" | "organization";
type InstalledPluginItem = WorkspacePluginItem | OrganizationPluginItem;

type PluginsInstalledViewProps = {
  scope?: PluginScope;
};

function getPluginRef(plugin: InstalledPluginItem): string {
  return String(plugin.slug || plugin.pluginId);
}

export function PluginsInstalledView({ scope = "workspace" }: PluginsInstalledViewProps) {
  const { t } = useTranslation(["plugin", "nav", "common", "settings"]);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const isOrganizationScope = scope === "organization";

  const [installOpen, setInstallOpen] = useState(false);
  const [restartHint, setRestartHint] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [selectedPluginRef, setSelectedPluginRef] = useState<string | null>(null);
  const [configPluginRef, setConfigPluginRef] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [confirm, setConfirm] = useState<{
    open: boolean;
    type: "reset" | "uninstall" | null;
    plugin: WorkspacePluginItem | null;
  }>({ open: false, type: null, plugin: null });
  const pageSize = 12;

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

  const enableMutation = useMutation({
    mutationFn: async (plugin: InstalledPluginItem) => {
      const pluginRef = getPluginRef(plugin);
      if (isOrganizationScope) {
        return plugin.enabled
          ? disableOrganizationPlugin(pluginRef)
          : enableOrganizationPlugin(pluginRef);
      }

      if (!workspaceId) throw new Error("workspaceId is required");
      return plugin.enabled
        ? disableWorkspacePlugin(workspaceId, pluginRef)
        : enableWorkspacePlugin(workspaceId, pluginRef);
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(
        listQueryKey,
        (prev: { items: InstalledPluginItem[] } | undefined) => {
          if (!prev) return prev;
          const nextItems = prev.items.map((it) =>
            it.pluginId === updated.pluginId ? { ...it, ...updated } : it,
          );
          return { ...prev, items: nextItems };
        },
      );
      await queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => notifyError(err),
  });

  const uninstallMutation = useMutation({
    mutationFn: async (plugin: WorkspacePluginItem) => {
      if (!workspaceId) throw new Error("workspaceId is required");
      await uninstallWorkspacePlugin(workspaceId, getPluginRef(plugin));
    },
    onSuccess: async () => {
      notifySuccessText(t("plugin:PLUGIN_CENTER_UNINSTALL_SUCCESS"));
      await queryClient.invalidateQueries({
        queryKey: ["workspace", "pluginsCenter", workspaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const resetMutation = useMutation({
    mutationFn: async (plugin: WorkspacePluginItem) => {
      if (!workspaceId) throw new Error("workspaceId is required");
      await resetWorkspacePluginConfig(workspaceId, getPluginRef(plugin));
    },
    onSuccess: async () => {
      notifySuccessText(t("plugin:PLUGIN_CENTER_RESET_SUCCESS"));
      await queryClient.invalidateQueries({
        queryKey: ["workspace", "pluginsCenter", workspaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const items = useMemo(
    () => (listQuery.data?.items ?? []) as InstalledPluginItem[],
    [listQuery.data?.items],
  );

  const selectedConfigPlugin = useMemo(() => {
    if (!isOrganizationScope || !configPluginRef) return null;
    const target = configPluginRef.trim().toLowerCase();
    return (
      items.find((p) => getPluginRef(p).trim().toLowerCase() === target && Boolean(p.hasConfigSchema)) ??
      null
    );
  }, [configPluginRef, isOrganizationScope, items]);

  useEffect(() => {
    if (!isOrganizationScope) return;
    if (!selectedConfigPlugin && configPluginRef) {
      setConfigPluginRef(null);
    }
  }, [configPluginRef, isOrganizationScope, selectedConfigPlugin]);

  const settingsQuery = useQuery({
    queryKey: ["organization", "plugins", configPluginRef, "settings"],
    enabled: Boolean(isOrganizationScope && selectedConfigPlugin),
    queryFn: async () => {
      if (!selectedConfigPlugin) throw new Error("plugin is required");
      return getOrganizationPluginSettings(getPluginRef(selectedConfigPlugin));
    },
    staleTime: 15 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const patchMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!selectedConfigPlugin) throw new Error("plugin is required");
      return patchOrganizationPluginSettings(getPluginRef(selectedConfigPlugin), patch);
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({
        queryKey: ["organization", "plugins", configPluginRef, "settings"],
      });
    },
    onError: (err) => notifyError(err),
  });

  const normalizedCategory =
    String(category || "")
      .trim()
      .toLowerCase() || "all";

  type PluginSearchOption = {
    value: string;
    label: string;
    description?: string | null;
    iconUrl?: string | null;
  };

  const searchOptions: PluginSearchOption[] = useMemo(
    () =>
      items.map((p) => ({
        value: getPluginRef(p),
        label: p.name,
        description: p.description,
        iconUrl: p.iconUrl,
      })),
    [items],
  );

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
    if (selectedPluginRef) {
      const ref = String(selectedPluginRef || "")
        .trim()
        .toLowerCase();
      out = out.filter((p) => getPluginRef(p).trim().toLowerCase() === ref);
    }
    return out;
  }, [items, normalizedCategory, selectedPluginRef]);

  const total = filtered.length;
  const pageItems = useMemo(() => {
    const start = (Math.max(1, page) - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [category, selectedPluginRef]);

  const categoryTabs = useMemo(() => {
    const defs = [
      { key: "content_creation", label: t("plugin:PLUGIN_CATEGORY_CONTENT_CREATION") },
      { key: "media_management", label: t("plugin:PLUGIN_CATEGORY_MEDIA_MANAGEMENT") },
      { key: "seo_marketing", label: t("plugin:PLUGIN_CATEGORY_SEO_MARKETING") },
      { key: "system_security", label: t("plugin:PLUGIN_CATEGORY_SYSTEM_SECURITY") },
      {
        key: "performance_optimization",
        label: t("plugin:PLUGIN_CATEGORY_PERFORMANCE_OPTIMIZATION"),
      },
      { key: "user_interaction", label: t("plugin:PLUGIN_CATEGORY_USER_INTERACTION") },
      { key: "data_integration", label: t("plugin:PLUGIN_CATEGORY_DATA_INTEGRATION") },
      { key: "data_analytics", label: t("plugin:PLUGIN_CATEGORY_DATA_ANALYTICS") },
    ];

    const counts = new Map<string, number>();
    for (const p of items) {
      const c = String(p.category || "")
        .trim()
        .toLowerCase();
      if (!c) continue;
      counts.set(c, (counts.get(c) || 0) + 1);
    }

    const tabs: { key: string; label: string }[] = [
      { key: "all", label: t("plugin:PLUGIN_CATEGORY_ALL") },
    ];
    for (const def of defs) {
      if ((counts.get(def.key) || 0) > 0) tabs.push(def);
    }
    return tabs;
  }, [items, t]);

  useEffect(() => {
    if (categoryTabs.some((c) => c.key === category)) return;
    setCategory("all");
  }, [category, categoryTabs]);

  const pageDescription = isOrganizationScope
    ? t("plugin:PLUGIN_CENTER_ORG_DESC")
    : t("plugin:PLUGIN_CENTER_DESC");

  if (!isOrganizationScope && !workspaceId) {
    return (
      <DefaultPage title={t("nav:NAV_PLUGINS_INSTALLED")} description={pageDescription}>
        <PageState
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
      <DefaultPage title={t("nav:NAV_PLUGINS_INSTALLED")} description={pageDescription}>
        <PageState loading loadingVariant="masonry" />
      </DefaultPage>
    );
  }

  if (listQuery.isError) {
    return (
      <DefaultPage title={t("nav:NAV_PLUGINS_INSTALLED")} description={pageDescription}>
        <PageState
          loading={false}
          error={listQuery.error}
          onRetry={() => void listQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  return (
    <DefaultPage
      title={t("nav:NAV_PLUGINS_INSTALLED")}
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
      extra={
        <div className="flex flex-col gap-3">
          <ChromeTabs value={category} onValueChange={(v) => setCategory(String(v))}>
            <ChromeTabsBar
              left={
                <ChromeTabsList>
                  {categoryTabs.map((c) => (
                    <ChromeTabsTrigger key={c.key} value={c.key}>
                      {c.label}
                    </ChromeTabsTrigger>
                  ))}
                </ChromeTabsList>
              }
              right={
                <Select
                  allowClear
                  showSearch
                  placeholder={t("plugin:PLUGIN_CENTER_SEARCH_PLACEHOLDER")}
                  value={selectedPluginRef}
                  style={{ width: 320 }}
                  options={searchOptions}
                  popupRender={(menu) => <div className="p-2">{menu}</div>}
                  optionRender={(opt) => {
                    const data = opt.data as unknown as PluginSearchOption;
                    return (
                      <div className="flex items-center gap-3 py-1">
                        <PluginIcon
                          name={data.label}
                          iconUrl={data.iconUrl}
                          size={32}
                          fallbackIconClassName="size-4"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{data.label}</div>
                          {data.description ? (
                            <div className="text-xs text-muted-foreground line-clamp-1">
                              {data.description}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  }}
                  filterOption={(input, option) => {
                    const q = String(input || "")
                      .trim()
                      .toLowerCase();
                    if (!q) return true;
                    const label = String(option?.label || "").toLowerCase();
                    const desc = String(
                      (option as unknown as PluginSearchOption).description || "",
                    ).toLowerCase();
                    return label.includes(q) || desc.includes(q);
                  }}
                  onChange={(v) => setSelectedPluginRef(v ? String(v) : null)}
                />
              }
            />
          </ChromeTabs>
        </div>
      }
    >
      {!isOrganizationScope && restartHint ? (
        <Card style={{ marginBottom: 16 }}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {t("plugin:PLUGIN_CENTER_RESTART_HINT")}
          </Typography.Paragraph>
        </Card>
      ) : null}

      {filtered.length === 0 ? (
        <PageState
          loading={false}
          empty
          emptyTitle={t("common:EMPTY_TITLE")}
          emptyDescription={t("plugin:PLUGIN_CENTER_EMPTY")}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pageItems.map((p) => {
            const status = normalizeStatus(p.status);
            const statusLabel = t(`plugin:PLUGIN_STATUS_${status.toUpperCase()}`, {
              defaultValue: p.status,
            });

            const pluginRef = getPluginRef(p);
            const configureHref = workspaceId
              ? `/w/${workspaceId}/plugins/${encodeURIComponent(pluginRef)}`
              : null;

            const orgItems: MenuProps["items"] =
              isOrganizationScope && p.hasConfigSchema
                ? [
                    {
                      key: "configure",
                      label: t("plugin:PLUGIN_CENTER_CONFIGURE_ACTION"),
                      icon: <Settings2 className="size-4" />,
                      disabled: !canManage,
                      onClick: () => setConfigPluginRef(pluginRef),
                    },
                  ]
                : [];

            const workspaceItems: MenuProps["items"] = configureHref
              ? [
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
                      setConfirm({ open: true, type: "reset", plugin: p as WorkspacePluginItem });
                    },
                  },
                  {
                    key: "detach",
                    label: t("plugin:PLUGIN_CENTER_UNINSTALL_ACTION"),
                    icon: <Trash2 className="size-4" />,
                    disabled: !canManage,
                    danger: true,
                    onClick: () => {
                      setConfirm({ open: true, type: "uninstall", plugin: p as WorkspacePluginItem });
                    },
                  },
                ]
              : [];

            const menuItems: MenuProps["items"] = isOrganizationScope ? orgItems : workspaceItems;
            const hasMenuActions = menuItems.length > 0;

            return (
              <Card
                size="small"
                type="inner"
                key={p.pluginId}
                loading={Boolean(listQuery.isFetching && !listQuery.isLoading)}
              >
                <Card.Meta
                  avatar={<PluginIcon name={p.name} iconUrl={p.iconUrl} size={40} />}
                  title={
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="font-semibold truncate">{p.name}</div>
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Tag
                              color={p.enabled ? "green" : undefined}
                              style={{ marginInlineEnd: 0 }}
                            >
                              {p.enabled
                                ? t("plugin:PLUGIN_ENABLED_TRUE")
                                : t("plugin:PLUGIN_ENABLED_FALSE")}
                            </Tag>
                            {normalizeStatus(p.status) !== "started" ? (
                              <Tag color={statusColor(status)} style={{ marginInlineEnd: 0 }}>
                                {statusLabel}
                              </Tag>
                            ) : null}
                            <Tag style={{ marginInlineEnd: 0 }}>{p.version}</Tag>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          {hasMenuActions ? (
                            <Dropdown trigger={["click"]} menu={{ items: menuItems }}>
                              <Button
                                type="text"
                                icon={<MoreVertical className="size-4" />}
                                aria-label={t("plugin:PLUGIN_CENTER_MORE")}
                              />
                            </Dropdown>
                          ) : null}
                          <Switch
                            checked={Boolean(p.enabled)}
                            disabled={!canManage || enableMutation.isPending}
                            aria-label={t("plugin:PLUGIN_CENTER_TOGGLE_ARIA", { name: p.name })}
                            onChange={() => enableMutation.mutate(p)}
                          />
                        </div>
                      </div>
                    </div>
                  }
                  description={
                    p.description ? (
                      <div className="text-sm text-muted-foreground line-clamp-2">
                        {p.description}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">{t("common:NA")}</div>
                    )
                  }
                />
              </Card>
            );
          })}
        </div>
      )}

      {total > 0 ? (
        <div className="mt-6 flex justify-end">
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={(p) => setPage(p)}
            showSizeChanger={false}
            showTotal={(total) => t("plugin:PLUGIN_CENTER_PAGINATION_TOTAL", { total })}
          />
        </div>
      ) : null}

      {isOrganizationScope && selectedConfigPlugin ? (
        <Card
          size="small"
          type="inner"
          className="mt-6"
          title={t("plugin:PLUGIN_CENTER_CONFIG_TITLE", { name: selectedConfigPlugin.name })}
        >
          {settingsQuery.isLoading && !settingsQuery.data ? (
            <PageState loading loadingVariant="form" />
          ) : settingsQuery.isError ? (
            <PageState
              loading={false}
              error={settingsQuery.error}
              onRetry={() => void settingsQuery.refetch()}
            />
          ) : settingsQuery.data ? (
            <PluginSettingsForm
              detail={settingsQuery.data}
              disabled={patchMutation.isPending}
              saving={patchMutation.isPending}
              onSubmitPatch={async (patch) => {
                await patchMutation.mutateAsync(patch);
              }}
            />
          ) : null}
        </Card>
      ) : null}

      <div className="mt-6">
        <AdminExtensionsSlot slot="admin.plugins.center.cards" title={t("nav:NAV_PLUGINS")} />
      </div>

      {!isOrganizationScope ? (
        <>
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

          <ConfirmDialog
            open={confirm.open}
            onOpenChange={(open) =>
              setConfirm((prev) =>
                open ? { ...prev, open: true } : { open: false, type: null, plugin: null },
              )
            }
            title={
              confirm.type === "reset"
                ? t("plugin:PLUGIN_CENTER_RESET_CONFIRM_TITLE")
                : t("plugin:PLUGIN_CENTER_UNINSTALL_CONFIRM_TITLE")
            }
            description={
              confirm.type === "reset"
                ? t("plugin:PLUGIN_CENTER_RESET_CONFIRM_DESC", { name: confirm.plugin?.name || "" })
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
        </>
      ) : null}
    </DefaultPage>
  );
}
