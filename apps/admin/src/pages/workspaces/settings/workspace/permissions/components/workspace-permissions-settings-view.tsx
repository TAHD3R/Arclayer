import { useTranslation } from "react-i18next";

import { TeamRolesPage } from "@/pages/workspaces/team/roles/page";

export function WorkspacePermissionsSettingsView(props: {
  workspaceId: string;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation(["settings"]);

  return (
    <div className="flex min-h-0 flex-col gap-4" data-testid="workspace-permissions-settings-view">
      <div>
        <h2 className="text-headline font-semibold text-label-primary">
          {t("settings:SETTINGS_WORKSPACE_PERMISSIONS_MATRIX_TITLE")}
        </h2>
        <p className="mt-1 text-body text-label-secondary">
          {t("settings:SETTINGS_WORKSPACE_PERMISSIONS_MATRIX_DESC")}
        </p>
      </div>

      <TeamRolesPage
        workspaceIdOverride={props.workspaceId}
        createOpen={props.createOpen}
        onCreateOpenChange={props.onCreateOpenChange}
        embedded
      />
    </div>
  );
}
