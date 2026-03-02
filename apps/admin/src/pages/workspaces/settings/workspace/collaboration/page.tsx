import { useNavigate, useParams } from "@tanstack/react-router";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { ChromeTabs, ChromeTabsContent } from "@/components/ui/chrome-tabs";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { WorkspaceSettingsTabs } from "../components/workspace-settings-tabs";
import { PlaceholderPoliciesPanel } from "../components/placeholder-policies-panel";
import { resolveWorkspaceSettingsTabNavigation } from "../utils";

export function WorkspaceSettingsCollaborationPage() {
  const { workspaceId } = useParams({
    from: "/w/$workspaceId/settings/workspace/collaboration/",
  });
  const { t } = useTranslation(["settings"]);
  const navigate = useNavigate();
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);

  React.useEffect(() => {
    setCurrentWorkspaceId(workspaceId);
  }, [setCurrentWorkspaceId, workspaceId]);

  const onTabChange = React.useCallback(
    (next: WorkspaceSettingsTabKey) => {
      void navigate({
        ...resolveWorkspaceSettingsTabNavigation(workspaceId, next),
      });
    },
    [navigate, workspaceId],
  );

  return (
    <DefaultPage
      title={t("settings:SETTINGS_WORKSPACE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_DESC")}
      width="fixed"
    >
      <ContentGuard loading={false}>
        <ChromeTabs
          value="collaboration"
          onValueChange={(next) => onTabChange(next as WorkspaceSettingsTabKey)}
        >
          <WorkspaceSettingsTabs />
          <ChromeTabsContent value="collaboration">
            <PlaceholderPoliciesPanel
              title={t("settings:SETTINGS_WORKSPACE_TAB_COLLABORATION")}
              description={t("settings:SETTINGS_WORKSPACE_COLLABORATION_DESC")}
              items={[
                {
                  title: t("settings:SETTINGS_WORKSPACE_COLLAB_EDIT_LOCK_TITLE"),
                  description: t("settings:SETTINGS_WORKSPACE_COLLAB_EDIT_LOCK_DESC"),
                },
                {
                  title: t("settings:SETTINGS_WORKSPACE_COLLAB_APPROVAL_FLOW_TITLE"),
                  description: t("settings:SETTINGS_WORKSPACE_COLLAB_APPROVAL_FLOW_DESC"),
                },
              ]}
            />
          </ChromeTabsContent>
        </ChromeTabs>
      </ContentGuard>
    </DefaultPage>
  );
}
