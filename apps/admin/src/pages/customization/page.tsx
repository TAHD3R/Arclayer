import { Blocks, BookOpenText, SwatchBook } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { WorkspaceDesignSystemsPage } from "@/pages/workspaces/settings/workspace/design-systems/page";
import { WorkspaceKnowledgePage } from "@/pages/workspaces/settings/workspace/knowledge/page";
import { WorkspaceSkillsPage } from "@/pages/workspaces/settings/workspace/skills/page";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";

type CustomizationSection = "knowledge" | "skills" | "design-systems";

const SECTION_COPY = {
  knowledge: {
    titleKey: "CUSTOMIZATION_KNOWLEDGE_TITLE",
    descriptionKey: "CUSTOMIZATION_KNOWLEDGE_DESCRIPTION",
    icon: BookOpenText,
  },
  skills: {
    titleKey: "CUSTOMIZATION_SKILLS_TITLE",
    descriptionKey: "CUSTOMIZATION_SKILLS_DESCRIPTION",
    icon: Blocks,
  },
  "design-systems": {
    titleKey: "CUSTOMIZATION_DESIGN_SYSTEMS_TITLE",
    descriptionKey: "CUSTOMIZATION_DESIGN_SYSTEMS_DESCRIPTION",
    icon: SwatchBook,
  },
} as const;

export function CustomizationPage(props: {
  section: CustomizationSection;
  requestedAction?: "import";
}) {
  const { t } = useTranslation("settings");
  const workspaceId = useWorkspaceStore(
    (state) => state.currentWorkspaceId ?? state.lastWorkspaceId,
  );
  const copy = SECTION_COPY[props.section];

  return (
    <DefaultPage
      title={t(copy.titleKey)}
      description={t(copy.descriptionKey)}
      showFavoriteToggle={false}
    >
      {workspaceId ? (
        props.section === "knowledge" ? (
          <WorkspaceKnowledgePage workspaceId={workspaceId} />
        ) : props.section === "skills" ? (
          <WorkspaceSkillsPage
            workspaceId={workspaceId}
            requestedAction={props.requestedAction}
            focusRequestId={props.requestedAction ? 1 : 0}
          />
        ) : (
          <WorkspaceDesignSystemsPage workspaceId={workspaceId} />
        )
      ) : (
        <Empty className="min-h-80 border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <copy.icon />
            </EmptyMedia>
            <EmptyTitle>{t("CUSTOMIZATION_WORKSPACE_REQUIRED_TITLE")}</EmptyTitle>
            <EmptyDescription>{t("CUSTOMIZATION_WORKSPACE_REQUIRED_DESCRIPTION")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </DefaultPage>
  );
}
