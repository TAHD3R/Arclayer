import { Controller } from "react-hook-form";

import { Accordion } from "@celestial/ui/accordion";
import { Button } from "@celestial/ui/button";
import { NativeSelect, NativeSelectOption } from "@celestial/ui/native-select";
import { SettingAccordionItem } from "@celestial/ui/setting-accordion-item";
import { SettingPanel } from "@celestial/ui/setting-panel";

import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import type { OrganizationSettingsBasicsController } from "../hooks/use-organization-settings-basics-controller";

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="text-footnote text-destructive">{message}</div>;
}

export function OrganizationSettingsBasicsAccessPanel(props: {
  controller: OrganizationSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;

  return (
    <SettingPanel
      title={t("settings:SETTINGS_ORG_ACCESS_PANEL_TITLE")}
      description={t("settings:SETTINGS_ORG_ACCESS_PANEL_DESC")}
    >
      <div className="rounded-lg border border-border">
        <Accordion type="single" collapsible className="px-0">
          <SettingAccordionItem
            value="organization_default_role"
            variant="action"
            title={t("settings:SETTINGS_ORG_DEFAULT_ROLE_TITLE")}
            description={t("settings:SETTINGS_ORG_DEFAULT_ROLE_DESC")}
            showSummary
            summary={c.defaultRoleLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            disabled={c.disabled || !c.coreQuery.data || c.roleOptions.length === 0}
            confirmText={t("settings:SETTINGS_SAVE")}
            confirmLoading={c.savingKey === "organization:defaultRole"}
            onConfirm={() =>
              void c.withSavingKey("organization:defaultRole", async () => {
                const values = await validateFormFields(c.form, ["defaultRoleCode"]);
                await c.patchCoreMutation.mutateAsync({
                  defaultRoleCode: String(values.defaultRoleCode),
                });
              })
            }
            onReset={
              c.isDefaultRoleDirty
                ? () =>
                    void c.withSavingKey("reset:organization:defaultRole", async () => {
                      c.form.setValue("defaultRoleCode", c.initialDefaultRoleCode, {
                        shouldDirty: false,
                      });
                      c.form.clearErrors("defaultRoleCode");
                      await c.patchCoreMutation.mutateAsync({
                        defaultRoleCode: String(c.initialDefaultRoleCode),
                      });
                    })
                : undefined
            }
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={c.savingKey === "reset:organization:defaultRole"}
          >
            <div className="space-y-2">
              <Controller
                control={c.form.control}
                name="defaultRoleCode"
                rules={{ required: t("settings:SETTINGS_ORG_DEFAULT_ROLE_REQUIRED") }}
                render={({ field }) => (
                  <NativeSelect
                    value={field.value || ""}
                    onChange={(event) => field.onChange(event.target.value)}
                    className="w-full"
                    aria-invalid={
                      getFieldErrorMessage(c.form, "defaultRoleCode") ? true : undefined
                    }
                  >
                    <NativeSelectOption value="">{t("common:SELECT")}</NativeSelectOption>
                    {c.roleOptions.map((option) => (
                      <NativeSelectOption key={option.value} value={option.value}>
                        {option.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              />
              <FieldMessage message={getFieldErrorMessage(c.form, "defaultRoleCode")} />
            </div>
          </SettingAccordionItem>

          <SettingAccordionItem
            value="organization_assign_role_to_all"
            variant="action"
            title={t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_TITLE")}
            description={t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_DESC")}
            showSummary={false}
            keepRendered
            disabled={c.disabled || !c.isOwner || c.roleOptions.length === 0}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex-1 space-y-2">
                <Controller
                  control={c.form.control}
                  name="assignRoleCode"
                  rules={{ required: t("settings:SETTINGS_ORG_DEFAULT_ROLE_REQUIRED") }}
                  render={({ field }) => (
                    <NativeSelect
                      value={field.value || ""}
                      onChange={(event) => field.onChange(event.target.value)}
                      className="w-full"
                      aria-invalid={
                        getFieldErrorMessage(c.form, "assignRoleCode") ? true : undefined
                      }
                    >
                      <NativeSelectOption value="">{t("common:SELECT")}</NativeSelectOption>
                      {c.roleOptions.map((option) => (
                        <NativeSelectOption key={option.value} value={option.value}>
                          {option.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                />
                <FieldMessage message={getFieldErrorMessage(c.form, "assignRoleCode")} />
              </div>

              <Button
                type="button"
                disabled={c.disabled || !c.isOwner || c.roleOptions.length === 0}
                onClick={() => {
                  void validateFormFields(c.form, ["assignRoleCode"])
                    .then(() => {
                      c.assignRoleDialogForm.reset();
                      c.setAssignRoleDialogOpen(true);
                    })
                    .catch(() => undefined);
                }}
              >
                {t("settings:SETTINGS_ORG_ASSIGN_ROLE_ALL_CONFIRM")}
              </Button>
            </div>
          </SettingAccordionItem>
        </Accordion>
      </div>
    </SettingPanel>
  );
}
