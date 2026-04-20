import { Controller } from "react-hook-form";

import { Button } from "@arclayer/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

import { SettingsSectionAnchor } from "@/components/layout/settings-screen-provider";
import { PreferenceSettingRow } from "@/pages/usercenter/appearance/components/preference-setting-row";
import { UserCenterSettingPanel } from "@/pages/usercenter/shared/usercenter-setting-panel";
import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";

export function WorkspaceSettingsBasicsAccessPanel(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;

  return (
    <UserCenterSettingPanel
      title={t("settings:SETTINGS_WORKSPACE_ACCESS_PANEL_TITLE")}
      variant="dialog"
      showDivider
    >
      <SettingsSectionAnchor section="workspace-access">
        <div className="flex flex-col gap-4">
          <PreferenceSettingRow
            title={t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_DEFAULT_ROLE_DESC")}
            action={
              <Controller
                control={c.form.control}
                name="defaultRoleCode"
                render={({ field }) => (
                  <Select
                    value={field.value || undefined}
                    disabled={c.disabled || c.roleOptions.length === 0}
                    onValueChange={(value) => {
                      field.onChange(value);
                      void c.withSavingKey("workspace:defaultRole", async () => {
                        await c.patchWorkspaceRolePolicyMutation.mutateAsync({
                          defaultRoleCode: value,
                        });
                      });
                    }}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder={t("common:SELECT")} />
                    </SelectTrigger>
                    <SelectContent position="popper" align="end">
                      {c.roleOptions.map((option) => (
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
            title={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_TITLE")}
            description={t("settings:SETTINGS_WORKSPACE_ASSIGN_ROLE_ALL_DESC")}
            action={
              <Button
                type="button"
                variant="outline"
                disabled={c.disabled || c.roleOptions.length === 0}
                onClick={() => {
                  c.assignRoleDialogForm.reset();
                  c.setAssignRoleDialogOpen(true);
                }}
              >
                {t("team:TEAM_ACTION_EDIT")}
              </Button>
            }
          />
        </div>
      </SettingsSectionAnchor>
    </UserCenterSettingPanel>
  );
}
