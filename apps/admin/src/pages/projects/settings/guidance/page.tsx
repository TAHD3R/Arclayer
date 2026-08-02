import { BookOpenText } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ProjectGuidanceView } from "@/pages/workspaces/settings/workspace/knowledge/workspace-guidance-view";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";

export function ProjectGuidanceSettingsPage(props: { projectId: string }) {
  const { t } = useTranslation("knowledge");
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

  if (!workspaceId) {
    return (
      <Empty className="min-h-80 border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpenText aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("PROJECT_WORKSPACE_REQUIRED_TITLE")}</EmptyTitle>
          <EmptyDescription>{t("PROJECT_WORKSPACE_REQUIRED_DESCRIPTION")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return <ProjectGuidanceView workspaceId={workspaceId} projectId={props.projectId} />;
}
