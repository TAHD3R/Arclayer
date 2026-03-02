import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Form, Input } from "antd";
import * as React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { getMyOrganization } from "@/api/me";
import { deleteOrganization, leaveOrganization } from "@/api/organization-settings";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { ChromeTabs, ChromeTabsContent } from "@/components/ui/chrome-tabs";
import { SettingActionItem } from "@/components/settings-primitives/setting-action-item";
import { SettingDialog } from "@/components/settings-primitives/setting-dialog";
import { SettingPanel } from "@/components/settings-primitives/setting-panel";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { useSavingKey } from "@/hooks/use-saving-key";
import { ApiError } from "@/lib/http";
import { notifyError } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import type { OrganizationSettingsTabKey } from "../../types";
import { resolveOrganizationSettingsTabNavigation } from "../../utils";
import { OrganizationSettingsTabs } from "../../components/organization-settings-tabs";

type LeaveOrganizationDialogValues = { confirmText: string };

type DeleteOrganizationDialogValues = { confirmName: string };

export function OrganizationSettingsDangerView(props: { organizationId: string }) {
  const organizationId = String(props.organizationId || "").trim();
  const tab: OrganizationSettingsTabKey = "danger";
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const runtime = useSystemRuntime();
  const clearAuth = useAuthStore((s) => s.clear);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);

  const [leaveDialogForm] = Form.useForm<LeaveOrganizationDialogValues>();
  const [deleteDialogForm] = Form.useForm<DeleteOrganizationDialogValues>();
  const { savingKey, withSavingKey } = useSavingKey();
  const [leaveDialogOpen, setLeaveDialogOpen] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const onTabChange = React.useCallback(
    (next: OrganizationSettingsTabKey) => {
      void navigate({
        ...resolveOrganizationSettingsTabNavigation(organizationId, next),
      });
    },
    [navigate, organizationId],
  );

  const closeLeaveDialog = React.useCallback(() => {
    leaveDialogForm.resetFields();
    setLeaveDialogOpen(false);
  }, [leaveDialogForm]);

  const closeDeleteDialog = React.useCallback(() => {
    deleteDialogForm.resetFields();
    setDeleteDialogOpen(false);
  }, [deleteDialogForm]);

  const myOrgQuery = useQuery({
    queryKey: ["me", "organization", sessionVersion],
    queryFn: async () => getMyOrganization(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const isOwner = myOrgQuery.data?.membership?.role === "owner";
  const canManageOrganization =
    myOrgQuery.data?.membership?.role === "owner" || myOrgQuery.data?.membership?.role === "admin";

  const leaveMutation = useMutation({
    mutationFn: async (confirmText: string) => leaveOrganization(confirmText),
    onError: (err) => notifyError(err),
  });

  const deleteMutation = useMutation({
    mutationFn: async (confirmName: string) => deleteOrganization(confirmName),
    onError: (err) => notifyError(err),
  });

  const disabled =
    myOrgQuery.isFetching ||
    leaveMutation.isPending ||
    deleteMutation.isPending ||
    Boolean(savingKey);

  const persistedOrgName = String(myOrgQuery.data?.organization.name ?? "").trim();

  const dialogFieldLabel = React.useCallback((title: string, description: string) => {
    return (
      <div className="grid gap-1.5">
        <span className="font-semibold text-foreground">{title}</span>
        <span className="text-label-secondary">{description}</span>
      </div>
    );
  }, []);

  const forbiddenError = useMemo(
    () =>
      new ApiError({
        status: 403,
        message: t("common:PAGE_FORBIDDEN_DESC"),
        error: "ORG_ADMIN_REQUIRED",
      }),
    [t],
  );

  if (myOrgQuery.isLoading && !myOrgQuery.data) {
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

  if (myOrgQuery.isError) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard
          loading={false}
          error={myOrgQuery.error}
          onRetry={() => void myOrgQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  if (!canManageOrganization) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <ContentGuard loading={false} error={forbiddenError} hideRetry />
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
          <OrganizationSettingsTabs deploymentEnabled={runtime.deploymentSettingsEnabled} />

          <ChromeTabsContent value="danger">
            <SettingPanel
              title={t("settings:SETTINGS_ORG_DANGER_PANEL_TITLE")}
              description={t("settings:SETTINGS_ORG_DANGER_PANEL_DESC")}
            >
              <div className="divide-y">
                <SettingActionItem
                  title={t("settings:SETTINGS_ORG_LEAVE_TITLE")}
                  description={t("settings:SETTINGS_ORG_LEAVE_DESC")}
                  showSummary={false}
                  disabled={disabled}
                  onTrigger={() => {
                    leaveDialogForm.resetFields();
                    setLeaveDialogOpen(true);
                  }}
                />

                <SettingActionItem
                  title={t("settings:SETTINGS_ORG_DELETE_TITLE")}
                  description={t("settings:SETTINGS_ORG_DELETE_DESC")}
                  showSummary={false}
                  disabled={disabled || !isOwner}
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
          title={t("settings:SETTINGS_ORG_LEAVE_TITLE")}
          description={t("settings:SETTINGS_ORG_LEAVE_DESC")}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button type="text" onClick={closeLeaveDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                loading={savingKey === "organization:leave"}
                disabled={disabled}
                onClick={() => {
                  void withSavingKey("organization:leave", async () => {
                    const values = await leaveDialogForm.validateFields();
                    await leaveMutation.mutateAsync(String(values.confirmText || "").trim());
                    closeLeaveDialog();
                    clearAuth();
                    clearWorkspace();
                    await navigate({ to: "/login", replace: true });
                  });
                }}
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
                {
                  required: true,
                  message: t("settings:SETTINGS_ORG_LEAVE_CONFIRM_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === "LEAVE") {
                      return;
                    }
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
              <Button type="text" onClick={closeDeleteDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="primary"
                danger
                loading={savingKey === "organization:delete"}
                disabled={disabled || !isOwner}
                onClick={() => {
                  void withSavingKey("organization:delete", async () => {
                    const values = await deleteDialogForm.validateFields();
                    await deleteMutation.mutateAsync(String(values.confirmName || "").trim());
                    closeDeleteDialog();
                    clearAuth();
                    clearWorkspace();
                    await navigate({ to: "/login", replace: true });
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
                t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_REQUIRED"),
              )}
              rules={[
                {
                  required: true,
                  message: t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_REQUIRED"),
                },
                {
                  validator: async (_, value) => {
                    if (String(value || "").trim() === persistedOrgName) {
                      return;
                    }
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
