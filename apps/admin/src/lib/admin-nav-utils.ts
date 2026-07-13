import type { AdminNavItem } from "@/types/admin-nav";
import { getAppConfig } from "@/lib/config/app-config";

export function normalizePath(input: string): string {
  if (input.length > 1 && input.endsWith("/")) return input.slice(0, -1);
  return input;
}

function getMatchCandidates(item: AdminNavItem): string[] {
  const candidates = [
    ...(item.to ? [item.to] : []),
    ...(item.activeMatchPaths?.length ? item.activeMatchPaths : []),
  ].map(normalizePath);
  return Array.from(new Set(candidates));
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

      const candidates = getMatchCandidates(node);
      for (const candidate of candidates) {
        const exact = isExactMatch(candidate, pathname);
        const prefix = isPrefixMatch(candidate, pathname);
        const score = exact ? 1000 + candidate.length : prefix ? 100 + candidate.length : 0;
        const isMoreSpecificTrail = score === bestScore && nextParents.length > bestTrail.length;
        if (score > 0 && (score > bestScore || isMoreSpecificTrail)) {
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
  const brand = (getAppConfig().title || "Arclayer").trim();
  if (!workspaceName || !workspaceName.trim()) {
    return routeTitle && routeTitle.trim() ? `${routeTitle.trim()} | ${brand}` : brand;
  }

  const base = workspaceName.trim();
  const part = base.toLowerCase().includes(brand.toLowerCase()) ? base : `${base} ${brand}`;
  if (routeTitle && routeTitle.trim()) return `${routeTitle.trim()} | ${part}`;
  return part;
}
