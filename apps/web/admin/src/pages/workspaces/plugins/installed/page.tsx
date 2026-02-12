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
  listOrganizationPlugins,
  resetOrganizationPluginConfig,
  uninstallOrganizationPlugin,
} from "@/api/org-plugins";
import { getMyWorkspaceAuthz } from "@/api/workspaces";
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
import {
  ChromeTabs,
  ChromeTabsBar,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import {
  buildCategoryTabs,
  getPluginRef,
  normalizeStatus,
  statusColor,
  type InstalledPluginItem,
  type PluginScope,
  type PluginSearchOption,
} from "./helpers";

type PluginsInstalledViewProps = {
  scope?: PluginScope;
  organizationId?: string;
};

export function PluginsInstalledView({
  scope = "workspace",
  organizationId,
}: PluginsInstalledViewProps) {
  const { t } = useTranslation(["plugin", "nav", "common", "settings"]);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const isOrganizationScope = scope === "organization";

  const [installOpen, setInstallOpen] = useState(false);
  const [restartHint, setRestartHint] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [selectedPluginRef, setSelectedPluginRef] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [confirm, setConfirm] = useState<{
    open: boolean;
    type: "reset" | "uninstall" | null;
    plugin: InstalledPluginItem | null;
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

  const items = useMemo(
    () => (listQuery.data?.items ?? []) as InstalledPluginItem[],
    [listQuery.data?.items],
  );

  const normalizedCategory =
    String(category || "")
      .trim()
      .toLowerCase() || "all";

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

  const categoryTabs = useMemo(
    () => buildCategoryTabs(items, (key) => t(`plugin:${key}`)),
    [items, t],
  );

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
                          <div className="font-medium truncate">{data.label}</div>
                          {data.description ? (
                            <div className="text-sm text-muted-foreground truncate">
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
        <div
          className={
            isOrganizationScope
              ? "grid grid-cols-1 lg:grid-cols-2 gap-4"
              : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          }
        >
          {pageItems.map((p) => {
            const status = normalizeStatus(p.status);
            const statusLabel = t(`plugin:PLUGIN_STATUS_${status.toUpperCase()}`, {
              defaultValue: p.status,
            });

            const pluginRef = getPluginRef(p);
            const configureHref = isOrganizationScope
              ? effectiveOrganizationId
                ? `/o/${encodeURIComponent(effectiveOrganizationId)}/plugins/${encodeURIComponent(pluginRef)}`
                : null
              : workspaceId
                ? `/w/${workspaceId}/plugins/${encodeURIComponent(pluginRef)}`
                : null;

            const menuItems: MenuProps["items"] = configureHref
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
                      setConfirm({ open: true, type: "reset", plugin: p });
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
                      setConfirm({ open: true, type: "uninstall", plugin: p });
                    },
                  },
                ]
              : [];

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
                          <Dropdown trigger={["click"]} menu={{ items: menuItems }}>
                            <Button
                              type="text"
                              icon={<MoreVertical className="size-4" />}
                              aria-label={t("plugin:PLUGIN_CENTER_MORE")}
                            />
                          </Dropdown>
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

      <div className="mt-6">
        <AdminExtensionsSlot slot="admin.plugins.center.cards" title={t("nav:NAV_PLUGINS")} />
      </div>

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
