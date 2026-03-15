import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Button } from "@celestial/ui/button";
import { ChromeTabs, ChromeTabsContent } from "@celestial/ui/chrome-tabs";
import { Input } from "@celestial/ui/input";
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

function DialogField(props: {
  title: string;
  description: string;
  placeholder: string;
  error: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-1.5">
        <span className="font-semibold text-foreground">{props.title}</span>
        <span className="text-label-secondary">{props.description}</span>
      </div>
      {props.children}
      {props.error ? <div className="text-footnote text-destructive">{props.error}</div> : null}
    </div>
  );
}

export function OrganizationSettingsDangerView(props: { organizationId: string }) {
  const organizationId = String(props.organizationId || "").trim();
  const tab: OrganizationSettingsTabKey = "danger";
  const { t } = useTranslation(["settings", "common", "errors"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const leaveDialogForm = useForm<LeaveOrganizationDialogValues>({
    defaultValues: { confirmText: "" },
  });
  const deleteDialogForm = useForm<DeleteOrganizationDialogValues>({
    defaultValues: { confirmName: "" },
  });
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
    leaveDialogForm.reset();
    setLeaveDialogOpen(false);
  }, [leaveDialogForm]);

  const closeDeleteDialog = React.useCallback(() => {
    deleteDialogForm.reset();
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
    onError: (error) => notifyError(error),
  });

  const deleteMutation = useMutation({
    mutationFn: async (confirmName: string) =>
      deleteOrganizationInScope(organizationId, confirmName),
    onError: (error) => notifyError(error),
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

  const submitLeaveDialog = leaveDialogForm.handleSubmit(async (values) => {
    await leaveMutation.mutateAsync(String(values.confirmText || "").trim());
    notifySuccessText(t("common:ACTION_SUCCESS"));
    closeLeaveDialog();
    await completeFlow();
  });

  const submitDeleteDialog = deleteDialogForm.handleSubmit(async (values) => {
    await deleteMutation.mutateAsync(String(values.confirmName || "").trim());
    notifySuccessText(t("common:ACTION_SUCCESS"));
    closeDeleteDialog();
    await completeFlow();
  });

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
                    leaveDialogForm.reset();
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
                    deleteDialogForm.reset();
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
              <Button type="button" variant="ghost" onClick={closeLeaveDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="button"
                loading={savingKey === "organization:leave"}
                disabled={disabled || !canOpenLeave}
                onClick={() => {
                  void withSavingKey("organization:leave", async () => {
                    await submitLeaveDialog();
                  });
                }}
              >
                {t("settings:SETTINGS_ORG_LEAVE_CONFIRM_BUTTON")}
              </Button>
            </div>
          }
        >
          <Controller
            control={leaveDialogForm.control}
            name="confirmText"
            rules={{
              required: t("settings:SETTINGS_ORG_LEAVE_CONFIRM_REQUIRED"),
              validate: (value) =>
                String(value || "").trim() === confirmLeaveText ||
                t("settings:SETTINGS_ORG_LEAVE_CONFIRM_MISMATCH"),
            }}
            render={({ field, fieldState }) => (
              <DialogField
                title={t("settings:SETTINGS_DIALOG_CONFIRM_TEXT_LABEL")}
                description={t("settings:SETTINGS_ORG_LEAVE_CONFIRM_REQUIRED")}
                placeholder={t("settings:SETTINGS_ORG_LEAVE_CONFIRM_PLACEHOLDER")}
                error={fieldState.error?.message}
              >
                <Input
                  {...field}
                  placeholder={t("settings:SETTINGS_ORG_LEAVE_CONFIRM_PLACEHOLDER")}
                />
              </DialogField>
            )}
          />
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
              <Button type="button" variant="ghost" onClick={closeDeleteDialog}>
                {t("common:CANCEL")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                loading={savingKey === "organization:delete"}
                disabled={disabled || !canOpenDelete}
                onClick={() => {
                  void withSavingKey("organization:delete", async () => {
                    await submitDeleteDialog();
                  });
                }}
              >
                {t("common:DELETE")}
              </Button>
            </div>
          }
        >
          <Controller
            control={deleteDialogForm.control}
            name="confirmName"
            rules={{
              required: t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_REQUIRED"),
              validate: (value) =>
                String(value || "").trim() === confirmDeleteName ||
                t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_MISMATCH"),
            }}
            render={({ field, fieldState }) => (
              <DialogField
                title={t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL")}
                description={t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_REQUIRED")}
                placeholder={t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_PLACEHOLDER")}
                error={fieldState.error?.message}
              >
                <Input
                  {...field}
                  placeholder={t("settings:SETTINGS_ORG_DELETE_CONFIRM_NAME_PLACEHOLDER")}
                />
              </DialogField>
            )}
          />
        </SettingDialog>
      </ContentGuard>
    </DefaultPage>
  );
}
