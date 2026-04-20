import { GeneralSettingsPage } from "@/pages/projects/settings/site/page";

export function GeneralSiteSettingsPage(props: { projectId: string }) {
  return <GeneralSettingsPage activeTab="basics" projectId={props.projectId} />;
}
