import { useTranslation } from "react-i18next";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { ProjectSettingsPage as ProjectSettingsSurface } from "@/pages/projects/settings/project/page";
import { GeneralLocalizationSettingsPage } from "@/pages/projects/settings/site/localization/page";
import { ProjectDeploymentsPage as ProjectWebsiteReleasesSurface } from "@/pages/projects/deployments/page";
import { ProjectDomainSettingsPage as ProjectWebsiteDomainSurface } from "@/pages/projects/settings/domain/page";

export function ProjectGeneralSettingsPage(props: { projectId: string }) {
  return <ProjectSettingsSurface activeTab="general" projectId={props.projectId} />;
}

export function ProjectLocalizationSettingsPage(props: { projectId: string }) {
  return <GeneralLocalizationSettingsPage projectId={props.projectId} />;
}

function ProjectStandalonePage(props: { titleKey: string; descriptionKey?: string }) {
  const { t } = useTranslation(["account", "common"]);

  return (
    <DefaultPage
      title={t(props.titleKey)}
      description={t(props.descriptionKey ?? "common:PAGE_COMING_SOON_DESC")}
      showFavoriteToggle={false}
      pageFrame="full"
      className="min-h-full"
      contentClassName="min-h-full"
      contentContainerClassName="min-h-full"
    />
  );
}

export function ProjectDomainSettingsPage(props: { projectId: string }) {
  return <ProjectWebsiteDomainSurface projectId={props.projectId} />;
}

export function ProjectSeoSettingsPage() {
  return <ProjectStandalonePage titleKey="account:SETTINGS_NAV_PROJECT_SEO" />;
}

export function ProjectApiKeysSettingsPage(props: { projectId: string }) {
  return <ProjectSettingsSurface activeTab="api" projectId={props.projectId} />;
}

export function ProjectEnvironmentsSettingsPage(props: { projectId: string }) {
  return <ProjectSettingsSurface activeTab="environments" projectId={props.projectId} />;
}

export function ProjectDeploymentsSettingsPage(props: { projectId: string }) {
  return <ProjectWebsiteReleasesSurface projectId={props.projectId} />;
}

export function ProjectDatabasesSettingsPage(props: { projectId: string }) {
  return <ProjectSettingsSurface activeTab="databases" projectId={props.projectId} />;
}

export function ProjectRuntimeSettingsPage() {
  return <ProjectStandalonePage titleKey="account:SETTINGS_NAV_PROJECT_RUNTIME" />;
}
