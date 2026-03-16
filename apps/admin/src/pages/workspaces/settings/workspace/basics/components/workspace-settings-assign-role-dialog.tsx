import { UserCog } from "@arclayer/ui/icons/lucide-animated";
import { useCallback } from "react";

import { Button } from "@arclayer/ui/button";
import { Form } from "@arclayer/ui/form";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";

import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";

function dialogFieldLabel(title: string, description: string) {
  return (
    <div className="grid gap-1.5">
      <span className="font-semibold text-foreground">{title}</span>
      <span className="text-label-secondary">{description}</span>
    </div>
  );
}

export function WorkspaceSettingsAssignRoleDialog(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;
  const confirmNameField = c.assignRoleDialogForm.register("confirmName", {
    required: t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_REQUIRED"),
    validate: (value) =>
      String(value || "").trim() === c.persistedWorkspaceName
        ? true
        : t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_MISMATCH"),
  });

  const handleConfirm = useCallback(
    c.assignRoleDialogForm.handleSubmit(async (values) => {
      void c.withSavingKey("workspace:assignRoleAll", async () => {
        const roleValues = await validateFormFields(c.form, ["assignRoleCode"]);
        await c.assignWorkspaceRoleMutation.mutateAsync({
          roleCode: String(roleValues.assignRoleCode),
          confirmName: String(values.confirmName || "").trim(),
        });
        c.closeAssignRoleDialog();
      });
    }),
    [c],
  );

  return (
    <SettingDialog
      open={c.assignRoleDialogOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) c.closeAssignRoleDialog();
      }}
      title={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_DESC")}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="ghost" onClick={c.closeAssignRoleDialog}>
            {t("common:CANCEL")}
          </Button>
          <Button
            type="button"
            loading={c.savingKey === "workspace:assignRoleAll"}
            disabled={c.disabled || c.roleOptions.length === 0}
            onClick={() => void handleConfirm()}
          >
            <span className="inline-flex items-center gap-2">
              <UserCog className="size-4" aria-hidden="true" />
              {t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM")}
            </span>
          </Button>
        </div>
      }
    >
      <Form {...c.assignRoleDialogForm}>
        <div className="grid gap-4 py-2">
          {c.assignRoleDescription ? (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
              <div className="text-footnote font-semibold text-foreground">{c.assignRoleLabel}</div>
              <div className="mt-1 text-caption text-label-secondary">
                {c.assignRoleDescription}
              </div>
            </div>
          ) : null}

          <label className="grid gap-2">
            {dialogFieldLabel(
              t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL"),
              t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_DIALOG_CONFIRM_DESC", {
                role: c.assignRoleLabel,
              }),
            )}
            <Input
              {...confirmNameField}
              placeholder={t(
                "settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_PLACEHOLDER",
              )}
              aria-invalid={
                getFieldErrorMessage(c.assignRoleDialogForm, "confirmName") ? true : undefined
              }
            />
            <div className="text-footnote text-destructive">
              {getFieldErrorMessage(c.assignRoleDialogForm, "confirmName")}
            </div>
          </label>
        </div>
      </Form>
    </SettingDialog>
  );
}
