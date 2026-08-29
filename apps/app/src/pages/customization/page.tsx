import { Blocks, BookOpenText, SwatchBook } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { WorkspaceDesignSystemsPage } from "@/pages/workspaces/settings/workspace/design-systems/page";
import { WorkspaceKnowledgePage } from "@/pages/workspaces/settings/workspace/knowledge/page";
import {
  WorkspaceSkillsPage,
  type WorkspaceSkillCreateAction,
} from "@/pages/workspaces/settings/workspace/skills/page";
import { WorkspaceSkillsHeaderActions } from "@/pages/workspaces/settings/workspace/skills/workspace-skills-view";
import {
  DesignSystemHeaderDescription,
  DesignSystemHeaderTitle,
  WorkspaceDesignSystemsHeaderActions,
} from "@/pages/workspaces/settings/workspace/design-systems/workspace-design-systems-view";
import type { WorkspaceDesignSystemsController } from "@/pages/workspaces/settings/workspace/design-systems/use-workspace-design-systems-controller";
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
  requestedAction?: WorkspaceSkillCreateAction;
}) {
  const { t } = useTranslation("settings");
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const copy = SECTION_COPY[props.section];
  const [requestedAction, setRequestedAction] = useState<WorkspaceSkillCreateAction>();
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [designSystemsController, setDesignSystemsController] =
    useState<WorkspaceDesignSystemsController | null>(null);

  useEffect(() => {
    if (!props.requestedAction) return;
    setRequestedAction(props.requestedAction);
    setFocusRequestId((current) => current + 1);
  }, [props.requestedAction]);

  useEffect(() => {
    if (props.section !== "design-systems" || !workspaceId) setDesignSystemsController(null);
  }, [props.section, workspaceId]);

  const requestSkillAction = (action: WorkspaceSkillCreateAction) => {
    setRequestedAction(action);
    setFocusRequestId((current) => current + 1);
  };
  const pageAction =
    props.section === "skills" && workspaceId ? (
      <WorkspaceSkillsHeaderActions workspaceId={workspaceId} onSelect={requestSkillAction} />
    ) : props.section === "design-systems" && workspaceId && designSystemsController ? (
      <WorkspaceDesignSystemsHeaderActions controller={designSystemsController} />
    ) : null;

  // 详情态把设计系统的名称/描述编辑器提升为页头，替代静态板块文案。
  const designDetailActive =
    props.section === "design-systems" &&
    designSystemsController?.viewMode === "detail" &&
    Boolean(designSystemsController.draft);
  const pageTitle =
    designDetailActive && designSystemsController ? (
      <DesignSystemHeaderTitle controller={designSystemsController} />
    ) : (
      t(copy.titleKey)
    );
  const pageDescription =
    designDetailActive && designSystemsController ? (
      <DesignSystemHeaderDescription controller={designSystemsController} />
    ) : (
      t(copy.descriptionKey)
    );

  return (
    <DefaultPage
      title={pageTitle}
      description={pageDescription}
      showFavoriteToggle={false}
      action={pageAction}
    >
      {workspaceId ? (
        props.section === "knowledge" ? (
          <WorkspaceKnowledgePage workspaceId={workspaceId} />
        ) : props.section === "skills" ? (
          <WorkspaceSkillsPage
            workspaceId={workspaceId}
            requestedAction={requestedAction}
            focusRequestId={focusRequestId}
          />
        ) : (
          <WorkspaceDesignSystemsPage
            workspaceId={workspaceId}
            onControllerChange={setDesignSystemsController}
          />
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
