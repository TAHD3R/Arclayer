import { useCallback } from "react";
import { Controller } from "react-hook-form";

import { Button } from "@arclayer/ui/button";
import { Form } from "@arclayer/ui/form";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";

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
            {t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM")}
          </Button>
        </div>
      }
    >
      <Form {...c.assignRoleDialogForm}>
        <SettingDialogFields className="py-2">
          <SettingDialogField
            title={t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_DESC")}
            error={getFieldErrorMessage(c.form, "assignRoleCode") ?? undefined}
          >
            <Controller
              control={c.form.control}
              name="assignRoleCode"
              rules={{ required: t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_REQUIRED") }}
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger
                    className="w-full"
                    aria-invalid={getFieldErrorMessage(c.form, "assignRoleCode") ? true : undefined}
                  >
                    <SelectValue placeholder={t("common:SELECT")} />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    {c.roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </SettingDialogField>

          <SettingDialogField
            title={t("settings:SETTINGS_DIALOG_CONFIRM_NAME_LABEL")}
            description={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_DIALOG_CONFIRM_DESC", {
              role: c.assignRoleLabel,
            })}
            error={getFieldErrorMessage(c.assignRoleDialogForm, "confirmName") ?? undefined}
          >
            <Input
              {...confirmNameField}
              placeholder={t(
                "settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM_NAME_PLACEHOLDER",
              )}
              aria-invalid={
                getFieldErrorMessage(c.assignRoleDialogForm, "confirmName") ? true : undefined
              }
            />
          </SettingDialogField>
        </SettingDialogFields>
      </Form>
    </SettingDialog>
  );
}
