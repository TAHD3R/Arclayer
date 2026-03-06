import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Form, Input } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";

import {
  deleteOrganizationInScope,
  getOrganizationDangerCapabilities,
  leaveOrganizationInScope,
} from "@/api/organization-settings";
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

import { OrganizationSettingsTabs } from "../../components/organization-settings-tabs";
import type { OrganizationSettingsTabKey } from "../../types";
import { resolveOrganizationSettingsTabNavigation } from "../../utils";

type LeaveOrganizationDialogValues = { confirmText: string };
type DeleteOrganizationDialogValues = { confirmName: string };

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

export function OrganizationSettingsDangerView(props: { organizationId: string }) {
  const organizationId = String(props.organizationId || "").trim();
  const tab: OrganizationSettingsTabKey = "danger";
  const { t } = useTranslation(["settings", "common", "errors"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const [leaveDialogForm] = Form.useForm<LeaveOrganizationDialogValues>();
  const [deleteDialogForm] = Form.useForm<DeleteOrganizationDialogValues>();
  const { savingKey, withSavingKey } = useSavingKey();
  const [leaveDialogOpen, setLeaveDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const dangerQuery = useQuery({
    queryKey: ["organization", "danger", organizationId, sessionVersion],
    enabled: Boolean(organizationId),
    queryFn: async () => getOrganizationDangerCapabilities(organizationId),
    staleTime: 60 * 1000,
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
    (next: OrganizationSettingsTabKey) => {
      void navigate({ ...resolveOrganizationSettingsTabNavigation(organizationId, next) });
    },
    [navigate, organizationId],
  );

  const leaveMutation = useMutation({
    mutationFn: async (confirmText: string) =>
      leaveOrganizationInScope(organizationId, confirmText),
    onError: (err) => notifyError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: async (confirmName: string) =>
      deleteOrganizationInScope(organizationId, confirmName),
    onError: (err) => notifyError(err),
  });

  const disabled =
    dangerQuery.isFetching ||
    leaveMutation.isPending ||
    deleteMutation.isPending ||
    Boolean(savingKey);
  const danger = dangerQuery.data;
  const canOpenLeave = Boolean(danger?.leaveAction.enabled);
  const canOpenDelete = Boolean(danger?.deleteAction.enabled);
  const showBasicsTab = danger?.roleCode === "owner" || danger?.roleCode === "admin";
  const confirmLeaveText = String(danger?.confirmLeaveText || "LEAVE");
  const confirmDeleteName = String(danger?.confirmDeleteName || "");

  const completeFlow = React.useCallback(async () => {
    clearWorkspace();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["me"] }),
      queryClient.invalidateQueries({ queryKey: ["organization"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace"] }),
    ]);
    await navigate({ to: "/", replace: true });
  }, [clearWorkspace, navigate, queryClient]);

  const dialogFieldLabel = React.useCallback((title: string, description: string) => {
    return (
      <div className="grid gap-1.5">
        <span className="font-semibold text-foreground">{title}</span>
        <span className="text-label-secondary">{description}</span>
      </div>
    );
  }, []);

  if (dangerQuery.isLoading && !danger) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard loading loadingVariant="form" />
      </DefaultPage>
    );
  }

  if (dangerQuery.isError) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard
          loading={false}
          error={dangerQuery.error}
          onRetry={() => void dangerQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  return (
    <DefaultPage
      title={t("settings:SETTINGS_ORG_TITLE")}
      description={t("settings:SETTINGS_ORG_DESC")}
      width="fixed"
    >
      <ContentGuard loading={false}>
        <ChromeTabs
          value={tab}
          onValueChange={(next) => onTabChange(next as OrganizationSettingsTabKey)}
        >
          <OrganizationSettingsTabs showBasics={showBasicsTab} />
          <ChromeTabsContent value="danger">
            <SettingPanel
              title={t("settings:SETTINGS_ORG_DANGER_PANEL_TITLE")}
              description={t("settings:SETTINGS_ORG_DANGER_PANEL_DESC")}
            >
              <SettingActionGroup>
                <SettingActionItem
                  title={t("settings:SETTINGS_ORG_LEAVE_TITLE")}
                  description={getActionDescription(
                    t("settings:SETTINGS_ORG_LEAVE_DESC"),
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
                  title={t("settings:SETTINGS_ORG_DELETE_TITLE")}
                  description={getActionDescription(
                    t("settings:SETTINGS_ORG_DELETE_DESC"),
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
          title={t("settings:SETTINGS_ORG_LEAVE_TITLE")}
          description={t("settings:SETTINGS_ORG_LEAVE_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeLeaveDialog} autoInsertSpace={false}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                loading={savingKey === "organization:leave"}
                disabled={disabled || !canOpenLeave}
                onClick={() => {
                  void withSavingKey("organization:leave", async () => {
                    const values = await leaveDialogForm.validateFields();
                    await leaveMutation.mutateAsync(String(values.confirmText || "").trim());
                    notifySuccessText(t("common:ACTION_SUCCESS"));
                    closeLeaveDialog();
                    await completeFlow();
                  });
                }}
                autoInsertSpace={false}
              >
                {t("settings:SETTINGS_ORG_LEAVE_CONFIRM_BUTTON")}
              </Button>
            </div>
          }
        >
          <Form form={leaveDialogForm} layout="vertical" requiredMark={false} autoComplete="off">
            <Form.Item
              name="confirmText"
              label={dialogFieldLabel(
                t("settings:SETTINGS_DIALOG_CONFIRM_TEXT_LABEL"),
                t("settings:SETTINGS_ORG_LEAVE_CONFIRM_REQUIRED"),
              )}
              rules={[
                { required: true, message: t("settings:SETTINGS_ORG_LEAVE_CONFIRM_REQUIRED") },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === confirmLeaveText) return;
                    throw new Error(t("settings:SETTINGS_ORG_LEAVE_CONFIRM_MISMATCH"));
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                size="large"
                placeholder={t("settings:SETTINGS_ORG_LEAVE_CONFIRM_PLACEHOLDER")}
              />
            </Form.Item>
          </Form>
        </SettingDialog>

        <SettingDialog
          open={deleteDialogOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) closeDeleteDialog();
          }}
          title={t("settings:SETTINGS_ORG_DELETE_TITLE")}
          description={t("settings:SETTINGS_ORG_DELETE_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeDeleteDialog} autoInsertSpace={false}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                danger
                loading={savingKey === "organization:delete"}
                disabled={disabled || !canOpenDelete}
                onClick={() => {
                  void withSavingKey("organization:delete", async () => {
                    const values = await deleteDialogForm.validateFields();
                    await deleteMutation.mutateAsync(String(values.confirmName || "").trim());
                    notifySuccessText(t("common:ACTION_SUCCESS"));
                    closeDeleteDialog();
                    await completeFlow();
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
                t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_REQUIRED"),
              )}
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === confirmDeleteName) return;
                    throw new Error(t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_MISMATCH"));
                  },
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input
                size="large"
                placeholder={t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_PLACEHOLDER")}
              />
            </Form.Item>
          </Form>
        </SettingDialog>
      </ContentGuard>
    </DefaultPage>
  );
}
