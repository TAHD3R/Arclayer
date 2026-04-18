import { GeneralSettingsPage } from "@/pages/workspaces/settings/site/page";

export function GeneralSiteSettingsPage(props: { workspaceId?: string | null }) {
  return <GeneralSettingsPage activeTab="basics" workspaceIdOverride={props.workspaceId} />;
}
