export interface WorkspaceState {
  currentWorkspaceId: string | null;
  lastWorkspaceId: string | null;
  currentProjectId: string | null;
  lastProjectId: string | null;
  setCurrentWorkspaceId: (workspaceId: string | null) => void;
  setCurrentProjectId: (projectId: string | null) => void;
  setCurrentContext: (context: { workspaceId: string | null; projectId: string | null }) => void;
  setLastWorkspaceId: (workspaceId: string | null) => void;
  setLastProjectId: (projectId: string | null) => void;
  clearWorkspace: () => void;
}
