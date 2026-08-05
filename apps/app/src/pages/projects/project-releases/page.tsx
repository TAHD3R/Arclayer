import { ProjectReleasesPage } from "@/pages/projects/releases/page";
import { ProjectDomainSettingsPage } from "@/pages/projects/settings/domain/page";

type ProjectDomainsPageProps = {
  projectId: string;
};

export function ProjectDomainsPage({ projectId }: ProjectDomainsPageProps) {
  return (
    <ProjectDomainSettingsPage
      projectId={projectId}
      attachment={<ProjectReleasesPage projectId={projectId} embedded />}
    />
  );
}
