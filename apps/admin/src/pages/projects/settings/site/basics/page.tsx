import { GeneralSettingsPage } from "@/pages/projects/settings/site/page";

export function GeneralSiteSettingsPage(props: { projectId: string }) {
  return <GeneralSettingsPage projectId={props.projectId} />;
}
