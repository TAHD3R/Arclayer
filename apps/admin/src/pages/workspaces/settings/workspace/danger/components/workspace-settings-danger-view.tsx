import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Form, Input } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";

import {
  deleteWorkspace,
  getWorkspaceDangerCapabilities,
  leaveWorkspace,
  listMyWorkspaces,
} from "@/api/workspaces";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { ChromeTabs, ChromeTabsContent } from "@celestial/ui/chrome-tabs";
import { SettingActionGroup } from "@celestial/ui/setting-action-group";
import { SettingActionItem } from "@celestial/ui/setting-action-item";
import { SettingDialog } from "@celestial/ui/setting-dialog";
import { SettingPanel } from "@celestial/ui/setting-panel";
import { useSavingKey } from "@celestial/hooks/use-saving-key";

import { WorkspaceSettingsTabs } from "../../components/workspace-settings-tabs";
import type { DeleteWorkspaceDialogValues, LeaveWorkspaceDialogValues } from "../../types";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";
import { resolveWorkspaceSettingsTabNavigation } from "../../utils";

function getBlockedReasonText(
  code: string | null | undefined,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (!code) return null;
  const key = `errors:${code}`;
  const translated = t(key);
  return translated === key ? code : translated;
}

function getActionDescription(
  base: string,
  blockedReason: string | null | undefined,
  t: ReturnType<typeof useTranslation>["t"],
) {
  const blocked = getBlockedReasonText(blockedReason, t);
  return blocked ? [base, blocked] : base;
}

export function WorkspaceSettingsDangerView(props: { workspaceId: string }) {
  const workspaceId = String(props.workspaceId || "").trim();
  const { t } = useTranslation(["settings", "common", "errors"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const { savingKey, withSavingKey } = useSavingKey();
  const [leaveDialogForm] = Form.useForm<LeaveWorkspaceDialogValues>();
  const [deleteDialogForm] = Form.useForm<DeleteWorkspaceDialogValues>();
  const [leaveDialogOpen, setLeaveDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (!workspaceId) return;
    setCurrentWorkspaceId(workspaceId);
  }, [setCurrentWorkspaceId, workspaceId]);

  const dangerQuery = useQuery({
    queryKey: ["workspace", "danger", workspaceId, sessionVersion],
    enabled: Boolean(workspaceId),
    queryFn: async () => getWorkspaceDangerCapabilities(workspaceId),
    retry: false,
    meta: { silent: true },
  });

  const closeLeaveDialog = React.useCallback(() => {
    leaveDialogForm.resetFields();
    setLeaveDialogOpen(false);
  }, [leaveDialogForm]);

  const closeDeleteDialog = React.useCallback(() => {
    deleteDialogForm.resetFields();
    setDeleteDialogOpen(false);
  }, [deleteDialogForm]);

  const onTabChange = React.useCallback(
    (next: WorkspaceSettingsTabKey) => {
      void navigate({ ...resolveWorkspaceSettingsTabNavigation(workspaceId, next) });
    },
    [navigate, workspaceId],
  );

  const leaveWorkspaceMutation = useMutation({
    mutationFn: async (confirmText: string) => leaveWorkspace(workspaceId, confirmText),
    onError: (err) => notifyError(err),
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (confirmName: string) => deleteWorkspace(workspaceId, confirmName),
    onError: (err) => notifyError(err),
  });

  const disabled =
    dangerQuery.isFetching ||
    leaveWorkspaceMutation.isPending ||
    deleteWorkspaceMutation.isPending ||
    Boolean(savingKey);
  const danger = dangerQuery.data;
  const canOpenLeave = Boolean(danger?.leaveAction.enabled);
  const canOpenDelete = Boolean(danger?.deleteAction.enabled);
  const confirmLeaveText = String(danger?.confirmLeaveText || "LEAVE");
  const confirmDeleteName = String(danger?.confirmDeleteName || "");

  const navigateAfterWorkspaceRemoved = React.useCallback(async () => {
    const next = await listMyWorkspaces();
    const nextWorkspace =
      next.items.find((item) => item.workspaceId !== workspaceId) ?? next.items[0] ?? null;
    if (!nextWorkspace) {
      clearWorkspace();
      await navigate({ to: "/", replace: true });
      return;
    }
    setCurrentWorkspaceId(nextWorkspace.workspaceId);
    await navigate({ to: `/w/${nextWorkspace.workspaceId}/settings/workspace`, replace: true });
  }, [clearWorkspace, navigate, setCurrentWorkspaceId, workspaceId]);

  const dialogFieldLabel = React.useCallback((title: string, description: string) => {
    return (
      <div className="grid gap-1.5">
        <span className="font-semibold text-foreground">{title}</span>
        <span className="text-label-secondary">{description}</span>
      </div>
    );
  }, []);

  return (
    <DefaultPage
      title={t("settings:SETTINGS_WORKSPACE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_DESC")}
      width="fixed"
    >
      <ContentGuard
        loading={Boolean(dangerQuery.isLoading && !danger)}
        loadingVariant="form"
        error={dangerQuery.error}
        onRetry={() => {
          void dangerQuery.refetch();
        }}
      >
        <ChromeTabs
          value="danger"
          onValueChange={(next) => onTabChange(next as WorkspaceSettingsTabKey)}
        >
          <WorkspaceSettingsTabs />
          <ChromeTabsContent value="danger">
            <SettingPanel
              title={t("settings:SETTINGS_WORKSPACE_DANGER_PANEL_TITLE")}
              description={t("settings:SETTINGS_WORKSPACE_DANGER_PANEL_DESC")}
            >
              <SettingActionGroup>
                <SettingActionItem
                  title={t("settings:SETTINGS_WORKSPACE_LEAVE_TITLE")}
                  description={getActionDescription(
                    t("settings:SETTINGS_WORKSPACE_LEAVE_DESC"),
                    danger?.leaveAction.blockedReason,
                    t,
                  )}
                  showSummary={false}
                  disabled={disabled || !canOpenLeave}
                  onTrigger={() => {
                    leaveDialogForm.resetFields();
                    setLeaveDialogOpen(true);
                  }}
                />
                <SettingActionItem
                  title={t("settings:SETTINGS_WORKSPACE_DELETE_TITLE")}
                  description={getActionDescription(
                    t("settings:SETTINGS_WORKSPACE_DELETE_DESC"),
                    danger?.deleteAction.blockedReason,
                    t,
                  )}
                  showSummary={false}
                  disabled={disabled || !canOpenDelete}
                  onTrigger={() => {
                    deleteDialogForm.resetFields();
                    setDeleteDialogOpen(true);
                  }}
                />
              </SettingActionGroup>
            </SettingPanel>
          </ChromeTabsContent>
        </ChromeTabs>

        <SettingDialog
          open={leaveDialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closeLeaveDialog();
          }}
          title={t("settings:SETTINGS_WORKSPACE_LEAVE_TITLE")}
          description={t("settings:SETTINGS_WORKSPACE_LEAVE_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeLeaveDialog} autoInsertSpace={false}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                loading={savingKey === "workspace:leave"}
                disabled={disabled || !canOpenLeave}
                onClick={() => {
                  void withSavingKey("workspace:leave", async () => {
                    const values = await leaveDialogForm.validateFields();
                    await leaveWorkspaceMutation.mutateAsync(
                      String(values.confirmText || "").trim(),
                    );
                    await queryClient.invalidateQueries({ queryKey: ["workspace"] });
                    notifySuccessText(t("common:ACTION_SUCCESS"));
                    closeLeaveDialog();
                    await navigateAfterWorkspaceRemoved();
                  });
                }}
                autoInsertSpace={false}
              >
                {t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_BUTTON")}
              </Button>
            </div>
          }
        >
          <Form form={leaveDialogForm} layout="vertical" requiredMark={false} autoComplete="off">
            <Form.Item
              name="confirmText"
              label={dialogFieldLabel(
                t("settings:SETTINGS_DIALOG_CONFIRM_TEXT_LABEL"),
                t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_REQUIRED"),
              )}
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === confirmLeaveText) return;
                    throw new Error(t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_MISMATCH"));
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                size="large"
                placeholder={t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_PLACEHOLDER")}
              />
            </Form.Item>
          </Form>
        </SettingDialog>

        <SettingDialog
          open={deleteDialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closeDeleteDialog();
          }}
          title={t("settings:SETTINGS_WORKSPACE_DELETE_TITLE")}
          description={t("settings:SETTINGS_WORKSPACE_DELETE_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeDeleteDialog} autoInsertSpace={false}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                danger
                loading={savingKey === "workspace:delete"}
                disabled={disabled || !canOpenDelete}
                onClick={() => {
                  void withSavingKey("workspace:delete", async () => {
                    const values = await deleteDialogForm.validateFields();
                    await deleteWorkspaceMutation.mutateAsync(
                      String(values.confirmName || "").trim(),
                    );
                    await queryClient.invalidateQueries({ queryKey: ["workspace"] });
                    notifySuccessText(t("common:ACTION_SUCCESS"));
                    closeDeleteDialog();
                    await navigateAfterWorkspaceRemoved();
                  });
                }}
                autoInsertSpace={false}
              >
                {t("common:DELETE")}
              </Button>
            </div>
          }
        >
          <Form form={deleteDialogForm} layout="vertical" requiredMark={false} autoComplete="off">
            <Form.Item
              name="confirmName"
              label={dialogFieldLabel(
                t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
                t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_REQUIRED"),
              )}
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === confirmDeleteName) return;
                    throw new Error(t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_MISMATCH"));
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                size="large"
                placeholder={t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_PLACEHOLDER")}
              />
            </Form.Item>
          </Form>
        </SettingDialog>
      </ContentGuard>
    </DefaultPage>
  );
}
