import { GeneralSettingsPage } from "@/pages/projects/settings/site/page";

export function GeneralLocalizationSettingsPage(props: { projectId: string }) {
  return <GeneralSettingsPage activeTab="localization" projectId={props.projectId} />;
}
