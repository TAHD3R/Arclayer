import { WorkspaceSkillsView } from "./workspace-skills-view";

export function WorkspaceSkillsPage(props: {
  workspaceId: string;
  requestedAction?: "import";
  focusRequestId?: number;
}) {
  return <WorkspaceSkillsView {...props} />;
}
