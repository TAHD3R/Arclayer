export interface WorkspaceState {
  currentWorkspaceId: string | null;
  lastWorkspaceId: string | null;
  setCurrentWorkspaceId: (workspaceId: string | null) => void;
  setLastWorkspaceId: (workspaceId: string | null) => void;
  clearWorkspace: () => void;
}
