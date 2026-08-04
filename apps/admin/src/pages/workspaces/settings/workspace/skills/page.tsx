import { WorkspaceSkillsView } from "./workspace-skills-view";

export type WorkspaceSkillCreateAction = "manual" | "github" | "zip";

export function WorkspaceSkillsPage(props: {
  workspaceId: string;
  requestedAction?: WorkspaceSkillCreateAction;
  focusRequestId?: number;
}) {
  return <WorkspaceSkillsView {...props} />;
}
