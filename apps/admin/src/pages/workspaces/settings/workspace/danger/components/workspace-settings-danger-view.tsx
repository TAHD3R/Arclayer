import { WorkspaceSettingsDangerSection } from "../../basics/components/workspace-settings-danger-section";

export function WorkspaceSettingsDangerView(props: { workspaceId: string }) {
  return <WorkspaceSettingsDangerSection workspaceId={props.workspaceId} />;
}
