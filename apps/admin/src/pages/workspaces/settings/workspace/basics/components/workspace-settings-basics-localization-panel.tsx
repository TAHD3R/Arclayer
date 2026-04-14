import { Controller } from "react-hook-form";

import { Accordion } from "@arclayer/ui/accordion";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import {
  DateTimeFormatLocalizationControl,
  TimezoneLocalizationControl,
} from "@/components/settings/date-time-localization-controls";
import {
  applyValidationError,
  getFieldErrorMessage,
  validateFormFields,
} from "@/lib/forms/rhf-form-helpers";
import { normalizeLocale } from "@/lib/i18n";

import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="text-footnote text-destructive">{message}</div>;
}

export function WorkspaceSettingsBasicsLocalizationPanel(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;

  return (
    <SettingPanel
      title={t("settings:SETTINGS_WORKSPACE_LOCALIZATION_PANEL_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_LOCALIZATION_PANEL_DESC")}
      bordered={false}
    >
      <SettingActionGroup>
        <Accordion type="single" collapsible className="px-0">
          <SettingAccordionItem
            value="workspace_locale"
            variant="action"
            title={t("setup:SETUP_FIELD_LANGUAGE_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_LANGUAGE_DESC")}
            showSummary
            summary={c.workspaceLocaleLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            disabled={c.disabled || !c.coreQuery.data}
            contentLayout="inline"
            confirmText={t("settings:SETTINGS_SAVE")}
            confirmLoading={c.savingKey === "workspace:locale"}
            onConfirm={() =>
              void c.withSavingKey("workspace:locale", async () => {
                const values = await validateFormFields(c.form, ["locale"]);
                const nextLocale = normalizeLocale(values.locale);
                await c.patchWorkspaceCoreMutation.mutateAsync({
                  workspace_localization: { locale: nextLocale },
                });
                if (c.workspaceId) {
                  await c.queryClient.invalidateQueries({
                    queryKey: ["workspace", "adminMenu", c.workspaceId],
                  });
                  c.cacheWorkspaceLocale(String(c.workspaceId), nextLocale);
                }
                if (c.localePreferenceMode === "workspace") {
                  c.setEffectiveLocale(nextLocale);
                }
              })
            }
            onReset={
              c.isWorkspaceLocaleDirty && c.coreQuery.data
                ? () =>
                    void c.withSavingKey("reset:workspace:locale", async () => {
                      c.form.setValue("locale", c.initialWorkspaceLocale, { shouldDirty: false });
                      c.form.clearErrors("locale");
                      await c.patchWorkspaceCoreMutation.mutateAsync({
                        workspace_localization: {
                          locale: c.initialWorkspaceLocale,
                        },
                      });
                      if (c.workspaceId) {
                        await c.queryClient.invalidateQueries({
                          queryKey: ["workspace", "adminMenu", c.workspaceId],
                        });
                        c.cacheWorkspaceLocale(String(c.workspaceId), c.initialWorkspaceLocale);
                      }
                      if (c.localePreferenceMode === "workspace") {
                        c.setEffectiveLocale(c.initialWorkspaceLocale);
                      }
                    })
                : undefined
            }
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={c.savingKey === "reset:workspace:locale"}
          >
            <div className="space-y-2">
              <Controller
                control={c.form.control}
                name="locale"
                rules={{ required: t("setup:SETUP_VALIDATION_LOCALE_REQUIRED") }}
                render={({ field }) => (
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger
                      className="w-full"
                      aria-invalid={getFieldErrorMessage(c.form, "locale") ? true : undefined}
                    >
                      <SelectValue placeholder={t("common:SELECT")} />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {c.localeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldMessage message={getFieldErrorMessage(c.form, "locale")} />
              <div className="text-callout text-label-secondary">
                {t("settings:SETTINGS_WORKSPACE_LOCALIZATION_NOTE", {
                  locale: c.workspaceLocaleLabel ?? "-",
                })}
              </div>
            </div>
          </SettingAccordionItem>

          <SettingAccordionItem
            value="workspace_timezone"
            variant="action"
            title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_TIMEZONE_DESC")}
            showSummary
            summary={c.workspaceTimezoneLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            disabled={c.disabled || !c.coreQuery.data}
            confirmText={t("settings:SETTINGS_SAVE")}
            confirmLoading={c.savingKey === "workspace:timezone"}
            onConfirm={() =>
              void c.withSavingKey("workspace:timezone", async () => {
                const nextTimezone = String(c.form.getValues("timezone") || "").trim();
                if (!nextTimezone) {
                  applyValidationError(
                    c.form,
                    "timezone",
                    t("setup:SETUP_VALIDATION_TIMEZONE_REQUIRED"),
                  );
                  throw new Error("FORM_VALIDATION_FAILED");
                }
                c.form.clearErrors("timezone");
                await c.patchWorkspaceCoreMutation.mutateAsync({
                  workspace_localization: {
                    timezone: nextTimezone,
                    use_browser_timezone: c.workspaceUseBrowserTimeZone,
                  },
                });
              })
            }
            onReset={
              c.isWorkspaceTimezoneDirty && c.coreQuery.data
                ? () =>
                    void c.withSavingKey("reset:workspace:timezone", async () => {
                      c.form.setValue("timezone", c.initialWorkspaceTimezone, {
                        shouldDirty: false,
                      });
                      c.form.setValue("useBrowserTimeZone", c.initialWorkspaceUseBrowserTimeZone, {
                        shouldDirty: false,
                      });
                      c.form.clearErrors("timezone");
                      await c.patchWorkspaceCoreMutation.mutateAsync({
                        workspace_localization: {
                          timezone: c.initialWorkspaceTimezone,
                          use_browser_timezone: c.initialWorkspaceUseBrowserTimeZone,
                        },
                      });
                    })
                : undefined
            }
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={c.savingKey === "reset:workspace:timezone"}
          >
            <div className="space-y-2">
              <TimezoneLocalizationControl
                selectValue={String(c.workspaceTimezone)}
                switchChecked={c.workspaceUseBrowserTimeZone}
                switchLabel={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_TITLE")}
                switchDescription={t("settings:SETTINGS_LOCALIZATION_AUTO_TIMEZONE_SWITCH_DESC")}
                options={c.timezoneOptions}
                onSelectChange={(value) => {
                  c.form.setValue("timezone", value, { shouldDirty: true });
                  c.form.clearErrors("timezone");
                }}
                onSwitchChange={(checked) => {
                  c.form.setValue("useBrowserTimeZone", checked, { shouldDirty: true });
                }}
              />
              <FieldMessage message={getFieldErrorMessage(c.form, "timezone")} />
            </div>
          </SettingAccordionItem>

          <SettingAccordionItem
            value="workspace_date_format"
            variant="action"
            title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_DATE_FORMAT_DESC")}
            showSummary
            summary={c.workspaceDateFormatLabel}
            placeholder={t("settings:SETTINGS_NOT_SET")}
            keepRendered
            disabled={c.disabled || !c.coreQuery.data}
            confirmText={t("settings:SETTINGS_SAVE")}
            confirmLoading={c.savingKey === "workspace:dateFormat"}
            onConfirm={() =>
              void c.withSavingKey("workspace:dateFormat", async () => {
                const nextDateFormat = String(c.form.getValues("dateFormat") || "").trim();
                if (!nextDateFormat) {
                  applyValidationError(
                    c.form,
                    "dateFormat",
                    t("setup:SETUP_VALIDATION_DATE_FORMAT_REQUIRED"),
                  );
                  throw new Error("FORM_VALIDATION_FAILED");
                }
                c.form.clearErrors("dateFormat");
                await c.patchWorkspaceCoreMutation.mutateAsync({
                  workspace_localization: {
                    date_format: nextDateFormat,
                    use_relative_datetime: c.workspaceUseRelativeDateTime,
                  },
                });
              })
            }
            onReset={
              c.isWorkspaceDateFormatDirty && c.coreQuery.data
                ? () =>
                    void c.withSavingKey("reset:workspace:dateFormat", async () => {
                      c.form.setValue("dateFormat", c.initialWorkspaceDateFormat, {
                        shouldDirty: false,
                      });
                      c.form.setValue(
                        "useRelativeDateTime",
                        c.initialWorkspaceUseRelativeDateTime,
                        {
                          shouldDirty: false,
                        },
                      );
                      c.form.clearErrors("dateFormat");
                      await c.patchWorkspaceCoreMutation.mutateAsync({
                        workspace_localization: {
                          date_format: c.initialWorkspaceDateFormat,
                          use_relative_datetime: c.initialWorkspaceUseRelativeDateTime,
                        },
                      });
                    })
                : undefined
            }
            resetText={t("settings:SETTINGS_RESET")}
            resetLoading={c.savingKey === "reset:workspace:dateFormat"}
          >
            <div className="space-y-2">
              <DateTimeFormatLocalizationControl
                selectValue={String(c.workspaceDateFormat)}
                switchChecked={c.workspaceUseRelativeDateTime}
                switchLabel={t("settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_TITLE")}
                switchDescription={t(
                  "settings:SETTINGS_LOCALIZATION_RELATIVE_DATETIME_SWITCH_DESC",
                )}
                options={c.dateFormatOptions}
                onSelectChange={(value) => {
                  c.form.setValue("dateFormat", value, { shouldDirty: true });
                  c.form.clearErrors("dateFormat");
                }}
                onSwitchChange={(checked) => {
                  c.form.setValue("useRelativeDateTime", checked, { shouldDirty: true });
                }}
              />
              <FieldMessage message={getFieldErrorMessage(c.form, "dateFormat")} />
            </div>
          </SettingAccordionItem>
        </Accordion>
      </SettingActionGroup>
    </SettingPanel>
  );
}
