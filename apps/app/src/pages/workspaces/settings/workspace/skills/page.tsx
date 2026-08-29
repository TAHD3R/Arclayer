import { WorkspaceSkillsView } from "./workspace-skills-view";
import type { WorkspaceSkillScope } from "./workspace-skill-scope-tabs";

export type WorkspaceSkillCreateAction = "manual" | "github" | "zip";
export type { WorkspaceSkillScope };

export function WorkspaceSkillsPage(props: {
  scope: WorkspaceSkillScope;
  search?: string;
  onSearchChange?: (value: string) => void;
  workspaceId: string;
  requestedAction?: WorkspaceSkillCreateAction;
  focusRequestId?: number;
}) {
  return (
    <WorkspaceSkillsView
      {...props}
      onSearchChange={props.onSearchChange ?? (() => undefined)}
      search={props.search ?? ""}
    />
  );
}
