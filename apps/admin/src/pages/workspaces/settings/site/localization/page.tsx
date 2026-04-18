import { GeneralSettingsPage } from "@/pages/workspaces/settings/site/page";

export function GeneralLocalizationSettingsPage(props: { workspaceId?: string | null }) {
  return <GeneralSettingsPage activeTab="localization" workspaceIdOverride={props.workspaceId} />;
}
