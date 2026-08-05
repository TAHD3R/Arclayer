import { Controller } from "react-hook-form";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import { SettingsSectionAnchor } from "@/components/layout/settings-screen-provider";
import { normalizeLocale } from "@/lib/i18n";
import { RELATIVE_DATETIME_OPTION_VALUE } from "@/lib/settings/general/localization-options";
import { PreferenceSettingRow } from "@/pages/usercenter/appearance/components/preference-setting-row";
import { UserCenterSettingPanel } from "@/pages/usercenter/shared/usercenter-setting-panel";
import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";

export function WorkspaceSettingsBasicsLocalizationPanel(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;

  return (
    <UserCenterSettingPanel
      title={t("settings:SETTINGS_WORKSPACE_LOCALIZATION_PANEL_TITLE")}
      variant="dialog"
      showDivider
    >
      <div className="flex flex-col gap-4">
        <SettingsSectionAnchor section="workspace-localization">
          <PreferenceSettingRow
            title={t("setup:SETUP_FIELD_LANGUAGE_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_LANGUAGE_DESC")}
            action={
              <Controller
                control={c.form.control}
                name="locale"
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    disabled={c.disabled || !c.coreQuery.data}
                    onValueChange={(value) => {
                      const locale = normalizeLocale(value);
                      field.onChange(locale);
                      void c.withSavingKey("workspace:locale", async () => {
                        await c.patchWorkspaceCoreMutation.mutateAsync({
                          workspace_localization: { locale },
                        });
                        if (c.workspaceId) {
                          await c.queryClient.invalidateQueries({
                            queryKey: ["workspace", "adminMenu", c.workspaceId],
                          });
                          c.cacheWorkspaceLocale(String(c.workspaceId), locale);
                        }
                        if (c.localePreferenceMode === "workspace") {
                          c.setEffectiveLocale(locale);
                        }
                      });
                    }}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder={t("common:SELECT")} />
                    </SelectTrigger>
                    <SelectContent position="popper" align="end">
                      {c.localeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            }
          />
        </SettingsSectionAnchor>

        <PreferenceSettingRow
          title={t("setup:SETUP_FIELD_TIMEZONE_TITLE")}
          description={t("settings:SETTINGS_WORKSPACE_TIMEZONE_DESC")}
          action={
            <Controller
              control={c.form.control}
              name="timezone"
              render={({ field }) => (
                <Select
                  value={field.value || undefined}
                  disabled={c.disabled || !c.coreQuery.data}
                  onValueChange={(value) => {
                    field.onChange(value);
                    void c.withSavingKey("workspace:timezone", async () => {
                      await c.patchWorkspaceCoreMutation.mutateAsync({
                        workspace_localization: {
                          timezone: value,
                          use_browser_timezone: false,
                        },
                      });
                      c.form.setValue("useBrowserTimeZone", false, { shouldDirty: false });
                    });
                  }}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder={t("common:SELECT")} />
                  </SelectTrigger>
                  <SelectContent position="popper" align="end">
                    {c.timezoneOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          }
        />

        <PreferenceSettingRow
          title={t("setup:SETUP_FIELD_DATE_FORMAT_TITLE")}
          description={t("settings:SETTINGS_WORKSPACE_DATE_FORMAT_DESC")}
          action={
            <Controller
              control={c.form.control}
              name="dateFormat"
              render={({ field }) => (
                <Select
                  value={
                    c.workspaceUseRelativeDateTime
                      ? RELATIVE_DATETIME_OPTION_VALUE
                      : field.value || undefined
                  }
                  disabled={c.disabled || !c.coreQuery.data}
                  onValueChange={(value) => {
                    if (value === RELATIVE_DATETIME_OPTION_VALUE) {
                      c.form.setValue("useRelativeDateTime", true, { shouldDirty: false });
                      void c.withSavingKey("workspace:dateFormat", async () => {
                        await c.patchWorkspaceCoreMutation.mutateAsync({
                          workspace_localization: {
                            date_format: c.workspaceDateFormat,
                            use_relative_datetime: true,
                          },
                        });
                      });
                      return;
                    }
                    field.onChange(value);
                    void c.withSavingKey("workspace:dateFormat", async () => {
                      await c.patchWorkspaceCoreMutation.mutateAsync({
                        workspace_localization: {
                          date_format: value,
                          use_relative_datetime: false,
                        },
                      });
                      c.form.setValue("useRelativeDateTime", false, { shouldDirty: false });
                    });
                  }}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder={t("common:SELECT")} />
                  </SelectTrigger>
                  <SelectContent position="popper" align="end">
                    {c.dateTimePreferenceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          }
        />
      </div>
    </UserCenterSettingPanel>
  );
}
