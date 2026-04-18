import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import {
  deleteWorkspace,
  getWorkspaceDangerCapabilities,
  leaveWorkspace,
  listMyWorkspaces,
} from "@/api/workspaces";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Button } from "@arclayer/ui/button";
import { ChromeTabs } from "@arclayer/ui/chrome-tabs";
import { Input } from "@arclayer/ui/input";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingDialogField } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

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

function DialogField(props: {
  title: string;
  description: string;
  error: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <SettingDialogField title={props.title} description={props.description} error={props.error}>
      {props.children}
    </SettingDialogField>
  );
}

export function WorkspaceSettingsDangerView(props: { workspaceId: string }) {
  const workspaceId = String(props.workspaceId || "").trim();
  const { t } = useTranslation(["settings", "common", "errors"]);
  const navigate = useNavigate();
  const searchStr = useRouterState({
    select: (s) => s.location.searchStr,
    structuralSharing: true,
  });
  const queryClient = useQueryClient();
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const { savingKey, withSavingKey } = useSavingKey();
  const leaveDialogForm = useForm<LeaveWorkspaceDialogValues>({
    defaultValues: { confirmText: "" },
  });
  const deleteDialogForm = useForm<DeleteWorkspaceDialogValues>({
    defaultValues: { confirmName: "" },
  });
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
    leaveDialogForm.reset();
    setLeaveDialogOpen(false);
  }, [leaveDialogForm]);

  const closeDeleteDialog = React.useCallback(() => {
    deleteDialogForm.reset();
    setDeleteDialogOpen(false);
  }, [deleteDialogForm]);

  const onTabChange = React.useCallback(
    (next: WorkspaceSettingsTabKey) => {
      void navigate({ ...resolveWorkspaceSettingsTabNavigation(workspaceId, next, searchStr) });
    },
    [navigate, searchStr, workspaceId],
  );

  const leaveWorkspaceMutation = useMutation({
    mutationFn: async (confirmText: string) => leaveWorkspace(workspaceId, confirmText),
    onError: (error) => notifyError(error),
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (confirmName: string) => deleteWorkspace(workspaceId, confirmName),
    onError: (error) => notifyError(error),
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
    await navigate({ to: "/settings/workspace/general", replace: true });
  }, [clearWorkspace, navigate, setCurrentWorkspaceId, workspaceId]);

  const submitLeaveDialog = leaveDialogForm.handleSubmit(async (values) => {
    await leaveWorkspaceMutation.mutateAsync(String(values.confirmText || "").trim());
    await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    notifySuccessText(t("common:ACTION_SUCCESS"));
    closeLeaveDialog();
    await navigateAfterWorkspaceRemoved();
  });

  const submitDeleteDialog = deleteDialogForm.handleSubmit(async (values) => {
    await deleteWorkspaceMutation.mutateAsync(String(values.confirmName || "").trim());
    await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    notifySuccessText(t("common:ACTION_SUCCESS"));
    closeDeleteDialog();
    await navigateAfterWorkspaceRemoved();
  });

  return (
    <ChromeTabs
      value="danger"
      onValueChange={(next) => onTabChange(next as WorkspaceSettingsTabKey)}
    >
      <DefaultPage
        title={t("settings:SETTINGS_WORKSPACE_TITLE")}
        description={t("settings:SETTINGS_WORKSPACE_DESC")}
        headerVisibility="always"
        extra={<WorkspaceSettingsTabs />}
      >
        <section className="min-w-0">
          <ContentGuard
            loading={Boolean(dangerQuery.isLoading && !danger)}
            loadingVariant="form"
            error={dangerQuery.error}
            onRetry={() => {
              void dangerQuery.refetch();
            }}
          >
            <SettingPanel
              title={t("settings:SETTINGS_WORKSPACE_DANGER_PANEL_TITLE")}
              description={t("settings:SETTINGS_WORKSPACE_DANGER_PANEL_DESC")}
              bordered={false}
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
                    leaveDialogForm.reset();
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
                    deleteDialogForm.reset();
                    setDeleteDialogOpen(true);
                  }}
                />
              </SettingActionGroup>
            </SettingPanel>

            <SettingDialog
              open={leaveDialogOpen}
              onOpenChange={(nextOpen) => {
                if (!nextOpen) closeLeaveDialog();
              }}
              title={t("settings:SETTINGS_WORKSPACE_LEAVE_TITLE")}
              description={t("settings:SETTINGS_WORKSPACE_LEAVE_DESC")}
              footer={
                <div className="flex w-full justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={closeLeaveDialog}>
                    {t("common:CANCEL")}
                  </Button>
                  <Button
                    type="button"
                    loading={savingKey === "workspace:leave"}
                    disabled={disabled || !canOpenLeave}
                    onClick={() => {
                      void withSavingKey("workspace:leave", async () => {
                        await submitLeaveDialog();
                      });
                    }}
                  >
                    {t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_BUTTON")}
                  </Button>
                </div>
              }
            >
              <Controller
                control={leaveDialogForm.control}
                name="confirmText"
                rules={{
                  required: t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_REQUIRED"),
                  validate: (value) =>
                    String(value || "").trim() === confirmLeaveText ||
                    t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_MISMATCH"),
                }}
                render={({ field, fieldState }) => (
                  <DialogField
                    title={t("settings:SETTINGS_DIALOG_CONFIRM_TEXT_LABEL")}
                    description={t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_REQUIRED")}
                    error={fieldState.error?.message}
                  >
                    <Input
                      {...field}
                      placeholder={t("settings:SETTINGS_WORKSPACE_LEAVE_CONFIRM_PLACEHOLDER")}
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
              title={t("settings:SETTINGS_WORKSPACE_DELETE_TITLE")}
              description={t("settings:SETTINGS_WORKSPACE_DELETE_DESC")}
              footer={
                <div className="flex w-full justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={closeDeleteDialog}>
                    {t("common:CANCEL")}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    loading={savingKey === "workspace:delete"}
                    disabled={disabled || !canOpenDelete}
                    onClick={() => {
                      void withSavingKey("workspace:delete", async () => {
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
                  required: t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_REQUIRED"),
                  validate: (value) =>
                    String(value || "").trim() === confirmDeleteName ||
                    t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_MISMATCH"),
                }}
                render={({ field, fieldState }) => (
                  <DialogField
                    title={t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL")}
                    description={t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_REQUIRED")}
                    error={fieldState.error?.message}
                  >
                    <Input
                      {...field}
                      placeholder={t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_PLACEHOLDER")}
                    />
                  </DialogField>
                )}
              />
            </SettingDialog>
          </ContentGuard>
        </section>
      </DefaultPage>
    </ChromeTabs>
  );
}
