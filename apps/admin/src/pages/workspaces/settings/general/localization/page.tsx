import { useParams } from "@tanstack/react-router";

import { GeneralSettingsPage } from "@/pages/workspaces/settings/general/page";

export function GeneralLocalizationSettingsPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/settings/general/localization/" });
  return <GeneralSettingsPage activeTab="localization" workspaceIdOverride={workspaceId} />;
}
