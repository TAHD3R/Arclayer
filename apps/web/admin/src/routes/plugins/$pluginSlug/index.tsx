import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Card, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";

import { DefaultPage } from "@/components/common/default-page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

export const Route = createFileRoute("/plugins/$pluginSlug/")({
  component: PluginSlugPage,
});

function PluginSlugPage() {
  const { t } = useTranslation(["nav", "common"]);
  const navigate = useNavigate();
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { pluginSlug } = Route.useParams();

  useEffect(() => {
    if (!workspaceId) return;
    void navigate({ to: `/w/${workspaceId}/plugins/${pluginSlug}`, replace: true });
  }, [navigate, pluginSlug, workspaceId]);

  return (
    <DefaultPage
      title={`${t("nav:NAV_PLUGINS")} / ${pluginSlug}`}
      description={t("common:PAGE_COMING_SOON_DESC")}
    >
      <Card>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          {workspaceId ? t("common:WORKSPACE_REDIRECTING") : t("common:WORKSPACE_SELECT_DESC")}
        </Typography.Paragraph>
      </Card>
    </DefaultPage>
  );
}
