import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  deleteWorkspace,
  getWorkspaceDangerCapabilities,
  listMyWorkspaces,
} from "@/api/workspaces";
import { SettingsSectionAnchor } from "@/components/layout/settings-screen-provider";
import { DialogField } from "@/pages/usercenter/profile/components/dialog-field";
import { UserCenterSettingPanel } from "@/pages/usercenter/shared/usercenter-setting-panel";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { DeleteWorkspaceDialogValues } from "../../types";
import { Alert, AlertDescription } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingCard, SettingCardHeader } from "@arclayer/ui/setting-card";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

function getBlockedReasonText(
  code: string | null | undefined,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (!code) return null;
  const key = `errors:${code}`;
  const translated = t(key);
  return translated === key ? code : translated;
}

export function WorkspaceSettingsDangerSection(props: { workspaceId: string }) {
  const workspaceId = String(props.workspaceId || "").trim();
  const { t } = useTranslation(["settings", "common", "errors"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearWorkspace = useWorkspaceStore((state) => state.clearWorkspace);
  const setCurrentWorkspaceId = useWorkspaceStore((state) => state.setCurrentWorkspaceId);
  const { savingKey, withSavingKey } = useSavingKey();
  const form = useForm<DeleteWorkspaceDialogValues>({
    defaultValues: { confirmName: "" },
  });
  const [open, setOpen] = useState(false);

  const dangerQuery = useQuery({
    queryKey: ["workspace", "danger-capabilities", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => getWorkspaceDangerCapabilities(workspaceId),
    retry: false,
    meta: { silent: true },
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (confirmName: string) => deleteWorkspace(workspaceId, confirmName),
    onError: (error) => notifyError(error),
  });

  useEffect(() => {
    if (open) return;
    form.reset({ confirmName: "" });
  }, [form, open]);

  const blockedReasonText = useMemo(
    () => getBlockedReasonText(dangerQuery.data?.deleteAction.blockedReason, t),
    [dangerQuery.data?.deleteAction.blockedReason, t],
  );
  const confirmDeleteName = String(dangerQuery.data?.confirmDeleteName || "");
  const canDelete = Boolean(dangerQuery.data?.deleteAction.enabled);
  const canOpenDialog = Boolean(!dangerQuery.isLoading && !dangerQuery.isError && canDelete);
  const deleteButtonDisabled =
    deleteWorkspaceMutation.isPending || dangerQuery.isLoading || !canDelete;

  const navigateAfterWorkspaceRemoved = async () => {
    const next = await listMyWorkspaces();
    const nextWorkspace =
      next.items.find((item) => item.workspaceId !== workspaceId) ?? next.items[0] ?? null;
    if (!nextWorkspace) {
      clearWorkspace();
      await navigate({ to: "/", replace: true });
      return;
    }
    setCurrentWorkspaceId(nextWorkspace.workspaceId);
    await navigate({ to: `/projects/${nextWorkspace.projectId}/settings/general`, replace: true });
  };

  const submitDeleteDialog = form.handleSubmit(async (values) => {
    await deleteWorkspaceMutation.mutateAsync(String(values.confirmName || "").trim());
    await queryClient.invalidateQueries({ queryKey: ["workspace"], exact: false });
    notifySuccessText(t("common:ACTION_SUCCESS"));
    setOpen(false);
    form.reset({ confirmName: "" });
    await navigateAfterWorkspaceRemoved();
  });

  const deleteAction = (
    <Button
      variant="destructive"
      aria-disabled={!canOpenDialog}
      className={cn(!canOpenDialog && "cursor-not-allowed opacity-50")}
      onClick={() => {
        if (!canOpenDialog) return;
        setOpen(true);
      }}
    >
      {t("settings:SETTINGS_WORKSPACE_DELETE_TITLE")}
    </Button>
  );

  return (
    <>
      <SettingsSectionAnchor section="workspace-danger">
        <UserCenterSettingPanel
          title={t("settings:SETTINGS_WORKSPACE_DANGER_PANEL_TITLE")}
          variant="dialog"
          showDivider
        >
          <div className="flex flex-col gap-6">
            <SettingCard className="border-destructive/30">
              <SettingCardHeader
                title={t("settings:SETTINGS_WORKSPACE_DELETE_TITLE")}
                description={t("settings:SETTINGS_WORKSPACE_DELETE_DESC")}
                action={
                  blockedReasonText ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild focusTrigger={false}>
                          <span data-testid="delete-workspace-tooltip-trigger">{deleteAction}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-72 text-left">
                          {blockedReasonText}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    deleteAction
                  )
                }
              />
            </SettingCard>

            {dangerQuery.isError ? (
              <Alert variant="destructive">
                <AlertDescription>{t("common:REQUEST_FAILED")}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </UserCenterSettingPanel>
      </SettingsSectionAnchor>

      <SettingDialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            form.reset({ confirmName: "" });
          }
          setOpen(nextOpen);
        }}
        title={t("settings:SETTINGS_WORKSPACE_DELETE_TITLE")}
        description={t("settings:SETTINGS_WORKSPACE_DELETE_DESC")}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={deleteWorkspaceMutation.isPending}
              onClick={() => setOpen(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              variant="destructive"
              loading={savingKey === "workspace:delete"}
              disabled={deleteButtonDisabled}
              onClick={() => {
                void withSavingKey("workspace:delete", async () => {
                  await submitDeleteDialog();
                });
              }}
            >
              {t("common:DELETE")}
            </Button>
          </>
        }
      >
        <Controller
          control={form.control}
          name="confirmName"
          rules={{
            required: t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_REQUIRED"),
            validate: (value) =>
              String(value || "").trim() === confirmDeleteName ||
              t("settings:SETTINGS_WORKSPACE_DELETE_CONFIRM_NAME_MISMATCH"),
          }}
          render={({ field, fieldState }) => (
            <DialogField
              label={t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL")}
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
    </>
  );
}
