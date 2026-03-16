import { useParams } from "@tanstack/react-router";

import { GeneralSettingsPage } from "@/pages/workspaces/settings/general/page";

export function GeneralSiteSettingsPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/settings/site/basics/" });
  return <GeneralSettingsPage activeTab="basics" workspaceIdOverride={workspaceId} />;
}
