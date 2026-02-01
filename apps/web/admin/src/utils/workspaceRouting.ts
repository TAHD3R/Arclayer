export type WorkspaceListItem = {
  workspaceId: string;
  name?: string | null;
  slug?: string | null;
};

/**
 * 登录后「1B」策略：优先进入最近访问的工作区；否则若仅 1 个工作区则自动进入；否则返回 null 交由 UI 选择。
 */
export function pickDefaultWorkspaceId(params: {
  workspaces: WorkspaceListItem[];
  lastWorkspaceId: string | null | undefined;
}): string | null {
  const { workspaces, lastWorkspaceId } = params;
  if (!workspaces.length) return null;

  if (
    lastWorkspaceId &&
    workspaces.some((w) => String(w.workspaceId) === String(lastWorkspaceId))
  ) {
    return lastWorkspaceId;
  }

  if (workspaces.length === 1) return workspaces[0]?.workspaceId ?? null;
  return null;
}

export function workspaceHomePath(workspaceId: string): string {
  return `/w/${workspaceId}`;
}

/**
 * 用于工作区切换器：尽量保持用户当前页面不变，仅替换 /w/:workspaceId 前缀。
 * 若当前路径不是 workspace-scoped，则回退到 workspace home。
 */
export function switchWorkspacePath(params: {
  pathname: string;
  currentWorkspaceId: string | null | undefined;
  nextWorkspaceId: string;
}): string {
  const { pathname, currentWorkspaceId, nextWorkspaceId } = params;
  const nextPrefix = `/w/${nextWorkspaceId}`;

  const currentId = String(currentWorkspaceId || "");
  const fromPrefix = currentId ? `/w/${currentId}` : "";

  if (fromPrefix && pathname.startsWith(fromPrefix)) {
    return pathname.replace(fromPrefix, nextPrefix) || `${nextPrefix}/`;
  }

  // 兜底：避免把用户带到一个不可预期的路径
  return `${nextPrefix}/`;
}
