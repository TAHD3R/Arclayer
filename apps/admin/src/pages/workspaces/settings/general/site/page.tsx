import { useParams } from "@tanstack/react-router";

import { GeneralSettingsPage } from "@/pages/workspaces/settings/general/page";

export function GeneralSiteSettingsPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/settings/general/site/" });
  return <GeneralSettingsPage activeTab="site" workspaceIdOverride={workspaceId} />;
}
