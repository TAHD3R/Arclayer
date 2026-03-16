import { Controller } from "react-hook-form";

import { Accordion } from "@celestial/ui/accordion";
import { Button } from "@celestial/ui/button";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { SettingPanel } from "@celestial/ui/setting-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@celestial/ui/select";

import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="text-footnote text-destructive">{message}</div>;
}

export function WorkspaceSettingsBasicsAccessPanel(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;

  return (
    <SettingPanel
      title={t("settings:SETTINGS_WORKSPACE_ACCESS_PANEL_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_ACCESS_PANEL_DESC")}
    >
      <div className="rounded-lg border border-border">
        <Accordion type="single" collapsible className="px-0">
          <SettingAccordionItem
            value="workspace_default_role"
            variant="action"
            title={t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_DESC")}
            showSummary
            summary={c.defaultRoleLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            disabled={c.disabled || c.roleOptions.length === 0}
            contentLayout="inline"
            confirmText={t("settings:SETTINGS_SAVE")}
            confirmLoading={c.savingKey === "workspace:defaultRole"}
            onConfirm={() =>
              void c.withSavingKey("workspace:defaultRole", async () => {
                const values = await validateFormFields(c.form, ["defaultRoleCode"]);
                await c.patchWorkspaceRolePolicyMutation.mutateAsync({
                  defaultRoleCode: String(values.defaultRoleCode),
                });
              })
            }
            onReset={
              c.isDefaultRoleDirty
                ? () =>
                    void c.withSavingKey("reset:workspace:defaultRole", async () => {
                      c.form.setValue("defaultRoleCode", c.initialDefaultRoleCode, {
                        shouldDirty: false,
                      });
                      c.form.clearErrors("defaultRoleCode");
                      await c.patchWorkspaceRolePolicyMutation.mutateAsync({
                        defaultRoleCode: String(c.initialDefaultRoleCode),
                      });
                    })
                : undefined
            }
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={c.savingKey === "reset:workspace:defaultRole"}
          >
            <div className="space-y-2">
              <Controller
                control={c.form.control}
                name="defaultRoleCode"
                rules={{ required: t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_REQUIRED") }}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      className="w-full"
                      aria-invalid={
                        getFieldErrorMessage(c.form, "defaultRoleCode") ? true : undefined
                      }
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
              <FieldMessage message={getFieldErrorMessage(c.form, "defaultRoleCode")} />
            </div>
          </SettingAccordionItem>

          <SettingAccordionItem
            value="workspace_assign_role_to_all"
            variant="action"
            title={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_DESC")}
            showSummary={false}
            keepRendered
            disabled={c.disabled || c.roleOptions.length === 0}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex-1 space-y-2">
                <Controller
                  control={c.form.control}
                  name="assignRoleCode"
                  rules={{ required: t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_REQUIRED") }}
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={
                          getFieldErrorMessage(c.form, "assignRoleCode") ? true : undefined
                        }
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
                <FieldMessage message={getFieldErrorMessage(c.form, "assignRoleCode")} />
              </div>

              <Button
                type="button"
                disabled={c.disabled || c.roleOptions.length === 0}
                onClick={() => {
                  void validateFormFields(c.form, ["assignRoleCode"])
                    .then(() => {
                      c.assignRoleDialogForm.reset();
                      c.setAssignRoleDialogOpen(true);
                    })
                    .catch(() => undefined);
                }}
              >
                {t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_CONFIRM")}
              </Button>
            </div>
          </SettingAccordionItem>
        </Accordion>
      </div>
    </SettingPanel>
  );
}
