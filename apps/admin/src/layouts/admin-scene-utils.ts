import type { AdminNavItem } from "@/types/admin-nav";

export function mapWorkspaceNavItems(
  items: readonly AdminNavItem[],
  workspaceBase: string,
): AdminNavItem[] {
  const base = workspaceBase.endsWith("/") ? workspaceBase.slice(0, -1) : workspaceBase;
  const mapWorkspacePath = (value: string) =>
    value === "/" ? `${base}/` : `${base}${value.startsWith("/") ? value : `/${value}`}`;

  return items.map((item) => {
    const to = item.to ? mapWorkspacePath(item.to) : undefined;
    const activeMatchPaths = item.activeMatchPaths?.map(mapWorkspacePath);

    return {
      ...item,
      ...(to ? { to } : {}),
      ...(activeMatchPaths?.length ? { activeMatchPaths } : {}),
      ...(item.children?.length
        ? { children: mapWorkspaceNavItems(item.children, workspaceBase) }
        : {}),
    };
  });
}

export function extractWorkspaceBaseFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/(?:w|projects)\/([^/]+)/);
  if (!match?.[1]) return null;
  return `/projects/${match[1]}`;
}

export function attachSearchToNavItems(
  items: readonly AdminNavItem[],
  search: Record<string, unknown> | undefined,
): AdminNavItem[] {
  if (!search || Object.keys(search).length === 0) {
    return items.map((item) => ({
      ...item,
      ...(item.children?.length
        ? { children: attachSearchToNavItems(item.children, undefined) }
        : {}),
    }));
  }

  return items.map((item) => ({
    ...item,
    ...(item.to ? { search } : {}),
    ...(item.children?.length ? { children: attachSearchToNavItems(item.children, search) } : {}),
  }));
}
