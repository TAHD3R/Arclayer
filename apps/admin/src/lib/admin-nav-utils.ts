import type { AdminNavItem } from "@/types/admin-nav";
import { getAppConfig } from "@/constants/app-config";

export function normalizePath(input: string): string {
  if (input.length > 1 && input.endsWith("/")) return input.slice(0, -1);
  return input;
}

export function isExactMatch(to: string, pathname: string): boolean {
  const t = normalizePath(to);
  const p = normalizePath(pathname);
  return p === t;
}

export function isPrefixMatch(to: string, pathname: string): boolean {
  const t = normalizePath(to);
  const p = normalizePath(pathname);
  if (t === "/") return p === "/";
  return p === t || p.startsWith(`${t}/`);
}

export function findActiveTrailNodes(items: AdminNavItem[], pathname: string): AdminNavItem[] {
  let bestScore = -1;
  let bestTrail: AdminNavItem[] = [];

  const dfs = (nodes: AdminNavItem[], parents: AdminNavItem[]) => {
    for (const node of nodes) {
      const nextParents = [...parents, node];

      if (node.to) {
        const exact = isExactMatch(node.to, pathname);
        const prefix = isPrefixMatch(node.to, pathname);
        const score = exact ? 1000 + node.to.length : prefix ? 100 + node.to.length : 0;
        if (score > 0 && score > bestScore) {
          bestScore = score;
          bestTrail = nextParents;
        }
      }

      if (node.children?.length) dfs(node.children, nextParents);
    }
  };

  dfs(items, []);
  return bestTrail;
}

export function collectAllowedWorkspacePathPrefixes(
  items: AdminNavItem[],
  workspaceBase: string,
): string[] {
  const base = normalizePath(workspaceBase);
  const prefixes = new Set<string>();

  prefixes.add(base);
  prefixes.add(normalizePath(`${base}/notifications`));
  prefixes.add(normalizePath(`${base}/settings`));

  const walk = (nodes: AdminNavItem[]) => {
    for (const n of nodes) {
      if (n.to && !n.disabled) prefixes.add(normalizePath(n.to));
      if (n.children?.length) walk(n.children);
    }
  };
  walk(items);

  const hasTeam = Array.from(prefixes).some((p) => p.startsWith(normalizePath(`${base}/team/`)));
  if (hasTeam) prefixes.add(normalizePath(`${base}/team`));
  const hasExtensions = Array.from(prefixes).some((p) =>
    p.startsWith(normalizePath(`${base}/extensions/`)),
  );
  if (hasExtensions) prefixes.add(normalizePath(`${base}/extensions`));

  return Array.from(prefixes);
}

export function mapOrgItemsWithPrefix(
  items: AdminNavItem[],
  orgPathPrefix: string,
): AdminNavItem[] {
  return items.map((item) => {
    let to = item.to;
    if (item.to) {
      const subPath = item.to === "/" ? "" : item.to;
      to = `${orgPathPrefix}${subPath.startsWith("/") ? subPath : `/${subPath}`}`;
    }
    return {
      ...item,
      ...(to ? { to } : {}),
      ...(item.children?.length
        ? { children: mapOrgItemsWithPrefix(item.children, orgPathPrefix) }
        : {}),
    };
  });
}

export function buildDocumentTitle(
  routeTitle: string | null,
  workspaceName: string | null,
): string {
  const brand = (getAppConfig().title || "Celestial").trim();
  if (!workspaceName || !workspaceName.trim()) {
    return routeTitle && routeTitle.trim() ? `${routeTitle.trim()} | ${brand}` : brand;
  }

  const base = workspaceName.trim();
  const part = base.toLowerCase().includes(brand.toLowerCase()) ? base : `${base} ${brand}`;
  if (routeTitle && routeTitle.trim()) return `${routeTitle.trim()} | ${part}`;
  return part;
}
