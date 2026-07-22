import { WorkspaceSkillsView } from "./workspace-skills-view";

export function WorkspaceSkillsPage({ workspaceId }: { workspaceId: string }) {
  return <WorkspaceSkillsView workspaceId={workspaceId} />;
}
