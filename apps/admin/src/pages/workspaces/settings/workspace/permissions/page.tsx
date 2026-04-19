import { WorkspacePermissionsSettingsView } from "./components/workspace-permissions-settings-view";

export function WorkspacePermissionsSettingsPage(props: {
  workspaceId: string;
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
}) {
  return <WorkspacePermissionsSettingsView {...props} />;
}
