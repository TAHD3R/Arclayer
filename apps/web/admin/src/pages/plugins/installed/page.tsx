"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, Modal, Switch, Tag, Typography } from "antd";
import { MoreVertical, Package, Upload } from "lucide-react";

import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { AdminExtensionsSlot } from "@/components/extensions/admin-extensions-slot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { getMyWorkspaceAuthz } from "@/api/workspaces";
import type { WorkspacePluginItem } from "@/api/workspace-plugins";
import {
  disableWorkspacePlugin,
  enableWorkspacePlugin,
  installWorkspacePlugin,
  listWorkspacePlugins,
  resetWorkspacePluginConfig,
  uninstallWorkspacePlugin,
} from "@/api/workspace-plugins";

function normalizeStatus(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function statusColor(status: string): string {
  const s = normalizeStatus(status);
  if (s === "started") return "green";
  if (s === "installed") return "blue";
  if (s === "disabled") return "default";
  if (s === "failed") return "red";
  return "default";
}

export function PluginsInstalledView() {
  const { t } = useTranslation(["plugin", "nav", "common", "settings"]);
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const [installOpen, setInstallOpen] = useState(false);
  const [installFile, setInstallFile] = useState<File | null>(null);
  const [enableInWorkspace, setEnableInWorkspace] = useState(true);
  const [restartHint, setRestartHint] = useState(false);

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

  const installMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("workspaceId is required");
      if (!installFile) throw new Error("file is required");
      return installWorkspacePlugin({
        workspaceId,
        file: installFile,
        enableInWorkspace,
      });
    },
    onSuccess: async (res) => {
      setInstallOpen(false);
      setInstallFile(null);
      setRestartHint(Boolean(res.requiresRestart));
      notifySuccessText(t("plugin:PLUGIN_CENTER_INSTALL_SUCCESS"));
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

  const items = listQuery.data?.items ?? [];

  return (
    <DefaultPage
      title={t("nav:NAV_PLUGINS_INSTALLED")}
      description={t("plugin:PLUGIN_CENTER_DESC")}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{t("plugin:PLUGIN_CENTER_HINT")}</div>
        </div>
        <Button disabled={!canManage} onClick={() => setInstallOpen(true)} className="shrink-0">
          <Upload className="size-4" />
          {t("plugin:PLUGIN_CENTER_INSTALL_ACTION")}
        </Button>
      </div>

      {restartHint ? (
        <Card style={{ marginBottom: 16 }}>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {t("plugin:PLUGIN_CENTER_RESTART_HINT")}
          </Typography.Paragraph>
        </Card>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            {t("plugin:PLUGIN_CENTER_EMPTY")}
          </Typography.Paragraph>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((p) => {
            const status = normalizeStatus(p.status);
            const statusLabel = t(`plugin:PLUGIN_STATUS_${status.toUpperCase()}`, {
              defaultValue: p.status,
            });

            return (
              <Card key={p.pluginId} className="h-full">
                <div className="flex items-start gap-3">
                  <div className="size-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Package className="size-5 text-muted-foreground" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold truncate">{p.name}</div>
                      <Tag color={statusColor(status)} style={{ marginInlineEnd: 0 }}>
                        {statusLabel}
                      </Tag>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t("plugin:PLUGIN_CENTER_VERSION", { version: p.version })}
                    </div>
                    {p.description ? (
                      <div className="mt-2 text-sm text-muted-foreground line-clamp-2">
                        {p.description}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Switch
                      checked={Boolean(p.enabled)}
                      disabled={!canManage || enableMutation.isPending}
                      onChange={() => enableMutation.mutate(p)}
                    />

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={t("plugin:PLUGIN_CENTER_MORE")}
                        >
                          <MoreVertical className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={!canManage}
                          onClick={() => {
                            Modal.confirm({
                              title: t("plugin:PLUGIN_CENTER_RESET_CONFIRM_TITLE"),
                              content: t("plugin:PLUGIN_CENTER_RESET_CONFIRM_DESC", {
                                name: p.name,
                              }),
                              okText: t("common:CONFIRM"),
                              cancelText: t("common:CANCEL"),
                              onOk: async () => resetMutation.mutateAsync(p),
                            });
                          }}
                        >
                          {t("plugin:PLUGIN_CENTER_RESET_ACTION")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!canManage}
                          onClick={() => {
                            Modal.confirm({
                              title: t("plugin:PLUGIN_CENTER_UNINSTALL_CONFIRM_TITLE"),
                              content: t("plugin:PLUGIN_CENTER_UNINSTALL_CONFIRM_DESC", {
                                name: p.name,
                              }),
                              okText: t("common:CONFIRM"),
                              cancelText: t("common:CANCEL"),
                              onOk: async () => uninstallMutation.mutateAsync(p),
                            });
                          }}
                        >
                          {t("plugin:PLUGIN_CENTER_UNINSTALL_ACTION")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <AdminExtensionsSlot slot="admin.plugins.center.cards" title={t("nav:NAV_PLUGINS")} />
      </div>

      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t("plugin:PLUGIN_CENTER_INSTALL_DIALOG_TITLE")}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium">{t("plugin:PLUGIN_CENTER_FILE_LABEL")}</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="file"
                  accept=".zip"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setInstallFile(f);
                  }}
                />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {installFile ? installFile.name : t("plugin:PLUGIN_CENTER_FILE_EMPTY")}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="text-sm">{t("plugin:PLUGIN_CENTER_ENABLE_AFTER_INSTALL")}</div>
              <Switch checked={enableInWorkspace} onChange={setEnableInWorkspace} />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setInstallOpen(false)}
              disabled={installMutation.isPending}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              onClick={() => installMutation.mutate()}
              disabled={!installFile || installMutation.isPending}
            >
              <Upload className="size-4" />
              {t("plugin:PLUGIN_CENTER_INSTALL_CONFIRM")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DefaultPage>
  );
}
