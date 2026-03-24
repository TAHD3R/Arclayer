import { useParams } from "@tanstack/react-router";

import { GeneralSettingsPage } from "@/pages/workspaces/settings/site/page";

export function GeneralLocalizationSettingsPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/settings/site/localization/" });
  return <GeneralSettingsPage activeTab="localization" workspaceIdOverride={workspaceId} />;
}
