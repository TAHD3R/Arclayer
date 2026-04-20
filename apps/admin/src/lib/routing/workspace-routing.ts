export type WorkspaceListItem = {
  workspaceId: string;
  projectId?: string | null;
  name?: string | null;
  slug?: string | null;
};

/**
 * 登录后「1B」策略：优先进入最近访问的工作区；否则若仅 1 个工作区则自动进入；否则返回 null 交由 UI 选择。
 */
export function pickDefaultWorkspace(params: {
  workspaces: WorkspaceListItem[];
  lastWorkspaceId: string | null | undefined;
}): WorkspaceListItem | null {
  const { workspaces, lastWorkspaceId } = params;
  if (!workspaces.length) return null;

  if (
    lastWorkspaceId &&
    workspaces.some((w) => String(w.workspaceId) === String(lastWorkspaceId))
  ) {
    return (
      workspaces.find((workspace) => String(workspace.workspaceId) === String(lastWorkspaceId)) ??
      null
    );
  }

  if (workspaces.length === 1) return workspaces[0] ?? null;
  return null;
}

export function projectHomePath(projectId: string): string {
  return `/projects/${projectId}`;
}

export function workspaceHomePath(projectId: string): string {
  return projectHomePath(projectId);
}

export function projectsHomePath(): string {
  return "/projects";
}

/**
 * 用于工作区切换器：尽量保持用户当前页面不变，仅替换 /w/:workspaceId 前缀。
 * 若当前路径不是 workspace-scoped，则回退到 workspace home。
 */
export function switchWorkspacePath(params: {
  pathname: string;
  currentProjectId: string | null | undefined;
  nextProjectId: string;
}): string {
  const { pathname, currentProjectId, nextProjectId } = params;
  const nextPrefix = `/projects/${nextProjectId}`;

  const currentId = String(currentProjectId || "");
  const fromPrefix = currentId ? `/projects/${currentId}` : "";

  if (fromPrefix && pathname.startsWith(fromPrefix)) {
    return pathname.replace(fromPrefix, nextPrefix) || `${nextPrefix}/`;
  }

  return `${nextPrefix}/`;
}
