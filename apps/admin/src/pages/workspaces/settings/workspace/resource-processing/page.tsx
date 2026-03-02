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

export function WorkspaceSettingsResourceProcessingPage() {
  const { workspaceId } = useParams({
    from: "/w/$workspaceId/settings/workspace/resource-processing/",
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
          value="resource_processing"
          onValueChange={(next) => onTabChange(next as WorkspaceSettingsTabKey)}
        >
          <WorkspaceSettingsTabs />
          <ChromeTabsContent value="resource_processing">
            <PlaceholderPoliciesPanel
              title={t("settings:SETTINGS_WORKSPACE_TAB_RESOURCE_PROCESSING")}
              description={t("settings:SETTINGS_WORKSPACE_RESOURCE_PROCESSING_DESC")}
              items={[
                {
                  title: t("settings:SETTINGS_WORKSPACE_RESOURCE_PROCESSING_IMAGE_TITLE"),
                  description: t("settings:SETTINGS_WORKSPACE_RESOURCE_PROCESSING_IMAGE_DESC"),
                },
                {
                  title: t("settings:SETTINGS_WORKSPACE_RESOURCE_PROCESSING_VIDEO_TITLE"),
                  description: t("settings:SETTINGS_WORKSPACE_RESOURCE_PROCESSING_VIDEO_DESC"),
                },
              ]}
            />
          </ChromeTabsContent>
        </ChromeTabs>
      </ContentGuard>
    </DefaultPage>
  );
}
