import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Form, Input } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { getMyOrganization } from "@/api/me";
import { DefaultPage } from "@/components/common/default-page";
import { ContentGuard } from "@/components/common/content-guard";
import { ChromeTabs, ChromeTabsContent } from "@/components/ui/chrome-tabs";
import { SettingActionItem } from "@/components/settings-primitives/setting-action-item";
import { SettingDialog } from "@/components/settings-primitives/setting-dialog";
import { SettingPanel } from "@/components/settings-primitives/setting-panel";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useSavingKey } from "@/hooks/use-saving-key";
import { buildOrganizationPath } from "@/lib/routing/organization-routing";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";
import {
  deleteWorkspace,
  getWorkspaceDetail,
  leaveWorkspace,
  listMyWorkspaces,
} from "@/api/workspaces";

import { WorkspaceSettingsTabs } from "../../components/workspace-settings-tabs";
import type { DeleteWorkspaceDialogValues, LeaveWorkspaceDialogValues } from "../../types";
import { resolveWorkspaceSettingsTabNavigation } from "../../utils";

export function WorkspaceSettingsDangerView(props: { workspaceId: string }) {
  const workspaceId = String(props.workspaceId || "").trim();
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
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

  const onTabChange = React.useCallback(
    (next: WorkspaceSettingsTabKey) => {
      void navigate({
        ...resolveWorkspaceSettingsTabNavigation(workspaceId, next),
      });
    },
    [navigate, workspaceId],
  );

  const closeLeaveDialog = React.useCallback(() => {
    leaveDialogForm.resetFields();
    setLeaveDialogOpen(false);
  }, [leaveDialogForm]);

  const closeDeleteDialog = React.useCallback(() => {
    deleteDialogForm.resetFields();
    setDeleteDialogOpen(false);
  }, [deleteDialogForm]);

  const detailQuery = useQuery({
    queryKey: ["workspace", "detail", workspaceId, sessionVersion],
    enabled: Boolean(workspaceId),
    queryFn: async () => getWorkspaceDetail(workspaceId),
    retry: false,
    meta: { silent: true },
  });

  const myOrgQuery = useQuery({
    queryKey: ["me", "organization", sessionVersion],
    queryFn: async () => getMyOrganization(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const persistedWorkspaceName = String(detailQuery.data?.name ?? "").trim();
  const isOrgOwner = myOrgQuery.data?.membership.role === "owner";

  const leaveWorkspaceMutation = useMutation({
    mutationFn: async (confirmText: string) => leaveWorkspace(workspaceId, confirmText),
    onError: (err) => notifyError(err),
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (confirmName: string) => deleteWorkspace(workspaceId, confirmName),
    onError: (err) => notifyError(err),
  });

  const disabled =
    detailQuery.isFetching ||
    myOrgQuery.isFetching ||
    leaveWorkspaceMutation.isPending ||
    deleteWorkspaceMutation.isPending ||
    Boolean(savingKey);

  const dialogFieldLabel = React.useCallback((title: string, description: string) => {
    return (
      <div className="grid gap-1.5">
        <span className="font-semibold text-foreground">{title}</span>
        <span className="text-label-secondary">{description}</span>
      </div>
    );
  }, []);

  const navigateAfterWorkspaceRemoved = React.useCallback(async () => {
    const next = await listMyWorkspaces();
    const nextWorkspace =
      next.items.find((item) => item.workspaceId !== workspaceId) ?? next.items[0];

    if (nextWorkspace) {
      setCurrentWorkspaceId(nextWorkspace.workspaceId);
      await navigate({ to: `/w/${nextWorkspace.workspaceId}/settings/workspace`, replace: true });
      return;
    }

    setCurrentWorkspaceId(null);
    const orgId = String(myOrgQuery.data?.organization.id || "").trim();
    if (orgId) {
      await navigate({ to: buildOrganizationPath(orgId, "/settings"), replace: true });
      return;
    }

    await navigate({ to: "/", replace: true });
  }, [
    buildOrganizationPath,
    myOrgQuery.data?.organization.id,
    navigate,
    setCurrentWorkspaceId,
    workspaceId,
  ]);

  return (
    <DefaultPage
      title={t("settings:SETTINGS_WORKSPACE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_DESC")}
      width="fixed"
    >
      <ContentGuard
        loading={Boolean(detailQuery.isLoading && !detailQuery.data)}
        loadingVariant="form"
        error={
          detailQuery.isError ? detailQuery.error : myOrgQuery.isError ? myOrgQuery.error : null
        }
        onRetry={() => {
          void detailQuery.refetch();
          void myOrgQuery.refetch();
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
              <div className="divide-y">
                <SettingActionItem
                  title={t("settings:SETTINGS_WORKSPACE_LEAVE_TITLE")}
                  description={t("settings:SETTINGS_WORKSPACE_LEAVE_DESC")}
                  showSummary={false}
                  disabled={disabled}
                  onTrigger={() => {
                    leaveDialogForm.resetFields();
                    setLeaveDialogOpen(true);
                  }}
                />

                <SettingActionItem
                  title={t("settings:SETTINGS_WORKSPACE_DELETE_TITLE")}
                  description={t("settings:SETTINGS_WORKSPACE_DELETE_DESC")}
                  showSummary={false}
                  disabled={disabled || !isOrgOwner}
                  onTrigger={() => {
                    deleteDialogForm.resetFields();
                    setDeleteDialogOpen(true);
                  }}
                />
              </div>
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
              <Button type="text" onClick={closeLeaveDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                loading={savingKey === "workspace:leave"}
                disabled={disabled}
                onClick={() => {
                  void withSavingKey("workspace:leave", async () => {
                    const values = await leaveDialogForm.validateFields();
                    await leaveWorkspaceMutation.mutateAsync(
                      String(values.confirmText || "").trim(),
                    );
                    await queryClient.invalidateQueries({ queryKey: ["me", "workspaces"] });
                    notifySuccessText(t("common:ACTION_SUCCESS"));
                    closeLeaveDialog();
                    await navigateAfterWorkspaceRemoved();
                  });
                }}
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
                    if (String(value || "").trim() === "LEAVE") {
                      return;
                    }
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
              <Button type="text" onClick={closeDeleteDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                danger
                loading={savingKey === "workspace:delete"}
                disabled={disabled || !isOrgOwner}
                onClick={() => {
                  void withSavingKey("workspace:delete", async () => {
                    const values = await deleteDialogForm.validateFields();
                    await deleteWorkspaceMutation.mutateAsync(
                      String(values.confirmName || "").trim(),
                    );
                    await queryClient.invalidateQueries({ queryKey: ["me", "workspaces"] });
                    notifySuccessText(t("common:ACTION_SUCCESS"));
                    closeDeleteDialog();
                    await navigateAfterWorkspaceRemoved();
                  });
                }}
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
                    if (String(value || "").trim() === persistedWorkspaceName) {
                      return;
                    }
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
