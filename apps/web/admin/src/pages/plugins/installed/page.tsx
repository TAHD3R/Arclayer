"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { MenuProps } from "antd";
import { Button, Card, Dropdown, Modal, Pagination, Select, Switch, Tag, Typography } from "antd";
import { MoreVertical, RotateCcw, Settings2, Trash2, Upload } from "lucide-react";

import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { AdminExtensionsSlot } from "@/components/extensions/admin-extensions-slot";
import { ChromeTabs, ChromeTabsBar, ChromeTabsList, ChromeTabsTrigger } from "@/components/ui/chrome-tabs";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { getMyWorkspaceAuthz } from "@/api/workspaces";
import type { WorkspacePluginItem } from "@/api/workspace-plugins";
import {
  disableWorkspacePlugin,
  enableWorkspacePlugin,
  listWorkspacePlugins,
  resetWorkspacePluginConfig,
  uninstallWorkspacePlugin,
} from "@/api/workspace-plugins";
import { PluginInstallDialog } from "@/components/plugins/plugin-install-dialog";
import { PluginIcon } from "@/components/plugins/plugin-icon";

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

export function PluginsInstalledView() {
  const { t } = useTranslation(["plugin", "nav", "common", "settings"]);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const [installOpen, setInstallOpen] = useState(false);
  const [restartHint, setRestartHint] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [selectedPluginRef, setSelectedPluginRef] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const pageSize = 12;

  const authzQuery = useQuery({
    queryKey: ["workspace", "authz", workspaceId],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: async () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return getMyWorkspaceAuthz(workspaceId);
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const canManage = useMemo(() => {
    const codes = authzQuery.data?.permissionCodes ?? [];
    return codes.includes("system:plugins:manage") || Boolean(authzQuery.data?.isSuperuser);
  }, [authzQuery.data?.isSuperuser, authzQuery.data?.permissionCodes]);

  const listQuery = useQuery({
    queryKey: ["workspace", "pluginsCenter", workspaceId],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: async () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return listWorkspacePlugins(workspaceId);
    },
    staleTime: 15 * 1000,
    retry: false,
  });

  const enableMutation = useMutation({
    mutationFn: async (plugin: WorkspacePluginItem) => {
      if (!workspaceId) throw new Error("workspaceId is required");
      return plugin.enabled
        ? disableWorkspacePlugin(workspaceId, plugin.slug || plugin.pluginId)
        : enableWorkspacePlugin(workspaceId, plugin.slug || plugin.pluginId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["workspace", "pluginsCenter", workspaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const uninstallMutation = useMutation({
    mutationFn: async (plugin: WorkspacePluginItem) => {
      if (!workspaceId) throw new Error("workspaceId is required");
      await uninstallWorkspacePlugin(workspaceId, plugin.slug || plugin.pluginId);
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
      await resetWorkspacePluginConfig(workspaceId, plugin.slug || plugin.pluginId);
    },
    onSuccess: async () => {
      notifySuccessText(t("plugin:PLUGIN_CENTER_RESET_SUCCESS"));
      await queryClient.invalidateQueries({
        queryKey: ["workspace", "pluginsCenter", workspaceId],
      });
    },
    onError: (err) => notifyError(err),
  });

  const items = listQuery.data?.items ?? [];
  const normalizedCategory = String(category || "").trim().toLowerCase() || "all";

  type PluginSearchOption = {
    value: string;
    label: string;
    description?: string | null;
    iconUrl?: string | null;
  };

  const searchOptions: PluginSearchOption[] = useMemo(
    () =>
      items.map((p) => ({
        value: String(p.slug || p.pluginId),
        label: p.name,
        description: p.description,
        iconUrl: p.iconUrl,
      })),
    [items],
  );

  const filtered = useMemo(() => {
    let out = items;
    if (normalizedCategory !== "all") {
      out = out.filter((p) => String(p.category || "").trim().toLowerCase() === normalizedCategory);
    }
    if (selectedPluginRef) {
      const ref = String(selectedPluginRef || "").trim().toLowerCase();
      out = out.filter((p) => String(p.slug || p.pluginId).trim().toLowerCase() === ref);
    }
    return out;
  }, [items, normalizedCategory, selectedPluginRef]);

  const total = filtered.length;
  const pageItems = useMemo(() => {
    const start = (Math.max(1, page) - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    // Reset page when filters change.
    setPage(1);
  }, [category, selectedPluginRef]);

  const categoryTabs = useMemo(
    () => [
      { key: "all", label: t("plugin:PLUGIN_CATEGORY_ALL") },
      { key: "content_creation", label: t("plugin:PLUGIN_CATEGORY_CONTENT_CREATION") },
      { key: "media_management", label: t("plugin:PLUGIN_CATEGORY_MEDIA_MANAGEMENT") },
      { key: "seo_marketing", label: t("plugin:PLUGIN_CATEGORY_SEO_MARKETING") },
      { key: "system_security", label: t("plugin:PLUGIN_CATEGORY_SYSTEM_SECURITY") },
      { key: "performance_optimization", label: t("plugin:PLUGIN_CATEGORY_PERFORMANCE_OPTIMIZATION") },
      { key: "user_interaction", label: t("plugin:PLUGIN_CATEGORY_USER_INTERACTION") },
      { key: "data_integration", label: t("plugin:PLUGIN_CATEGORY_DATA_INTEGRATION") },
      { key: "data_analytics", label: t("plugin:PLUGIN_CATEGORY_DATA_ANALYTICS") },
    ],
    [t],
  );

  if (!workspaceId) {
    return (
      <DefaultPage
        title={t("nav:NAV_PLUGINS_INSTALLED")}
        description={t("plugin:PLUGIN_CENTER_DESC")}
      >
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
      <DefaultPage
        title={t("nav:NAV_PLUGINS_INSTALLED")}
        description={t("plugin:PLUGIN_CENTER_DESC")}
      >
        <PageState loading loadingVariant="masonry" />
      </DefaultPage>
    );
  }

  if (listQuery.isError) {
    return (
      <DefaultPage
        title={t("nav:NAV_PLUGINS_INSTALLED")}
        description={t("plugin:PLUGIN_CENTER_DESC")}
      >
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
      description={t("plugin:PLUGIN_CENTER_DESC")}
      action={
        <Button
          type="primary"
          icon={<Upload className="size-4" />}
          disabled={!canManage}
          onClick={() => setInstallOpen(true)}
        >
          {t("plugin:PLUGIN_CENTER_INSTALL_ACTION")}
        </Button>
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
                    const q = String(input || "").trim().toLowerCase();
                    if (!q) return true;
                    const label = String(option?.label || "").toLowerCase();
                    const desc = String((option as unknown as PluginSearchOption).description || "").toLowerCase();
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
      {restartHint ? (
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

            const pluginRef = p.slug || p.pluginId;
            const configureHref = `/w/${workspaceId}/plugins/${encodeURIComponent(pluginRef)}`;

            const menuItems: MenuProps["items"] = [
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
                  Modal.confirm({
                    title: t("plugin:PLUGIN_CENTER_RESET_CONFIRM_TITLE"),
                    content: t("plugin:PLUGIN_CENTER_RESET_CONFIRM_DESC", { name: p.name }),
                    okText: t("common:CONFIRM"),
                    cancelText: t("common:CANCEL"),
                    okButtonProps: { danger: true },
                    onOk: async () => resetMutation.mutateAsync(p),
                  });
                },
              },
              {
                key: "detach",
                label: t("plugin:PLUGIN_CENTER_UNINSTALL_ACTION"),
                icon: <Trash2 className="size-4" />,
                disabled: !canManage,
                danger: true,
                onClick: () => {
                  Modal.confirm({
                    title: t("plugin:PLUGIN_CENTER_UNINSTALL_CONFIRM_TITLE"),
                    content: t("plugin:PLUGIN_CENTER_UNINSTALL_CONFIRM_DESC", { name: p.name }),
                    okText: t("common:CONFIRM"),
                    cancelText: t("common:CANCEL"),
                    okButtonProps: { danger: true },
                    onOk: async () => uninstallMutation.mutateAsync(p),
                  });
                },
              },
            ];

            return (
              <Card
                key={p.pluginId}
                className="h-full"
                loading={Boolean(listQuery.isFetching && !listQuery.isLoading)}
                actions={[
                  <div key="switch" className="flex items-center justify-center">
                    <Switch
                      checked={Boolean(p.enabled)}
                      disabled={!canManage || enableMutation.isPending}
                      aria-label={t("plugin:PLUGIN_CENTER_TOGGLE_ARIA", { name: p.name })}
                      onChange={() => enableMutation.mutate(p)}
                    />
                  </div>,
                  <Dropdown key="more" trigger={["click"]} menu={{ items: menuItems }}>
                    <Button
                      type="text"
                      icon={<MoreVertical className="size-4" />}
                      aria-label={t("plugin:PLUGIN_CENTER_MORE")}
                    />
                  </Dropdown>,
                ]}
              >
                <Card.Meta
                  avatar={<PluginIcon name={p.name} iconUrl={p.iconUrl} size={40} />}
                  title={
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="font-semibold truncate">{p.name}</div>
                        <Tag style={{ marginInlineEnd: 0 }}>{p.version}</Tag>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Tag color={statusColor(status)} style={{ marginInlineEnd: 0 }}>
                          {statusLabel}
                        </Tag>
                      </div>
                    </div>
                  }
                  description={
                    p.description ? (
                      <div className="text-sm text-muted-foreground line-clamp-2">{p.description}</div>
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

      <div className="mt-6">
        <AdminExtensionsSlot slot="admin.plugins.center.cards" title={t("nav:NAV_PLUGINS")} />
      </div>

      <PluginInstallDialog
        workspaceId={workspaceId}
        open={installOpen}
        onOpenChange={setInstallOpen}
        disabled={!canManage}
        onInstalled={({ requiresRestart }) => {
          setRestartHint(Boolean(requiresRestart));
          void queryClient.invalidateQueries({ queryKey: ["workspace", "pluginsCenter", workspaceId] });
        }}
      />
    </DefaultPage>
  );
}
