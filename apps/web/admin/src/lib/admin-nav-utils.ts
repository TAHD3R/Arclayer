import type { LucideIcon } from "lucide-react";
import {
  Activity,
  File,
  FileText,
  Gauge,
  HardDrive,
  History,
  Images,
  LibraryBig,
  Navigation2,
  Package,
  Paintbrush,
  Palette,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";

import type { AdminNavItem } from "@/constants/admin-nav";
import { getAppConfig } from "@/constants/app-config";
import type { AdminMenuNodeEffective } from "@/types/api";

// ---------------------------------------------------------------------------
// Icon resolution
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  Gauge,
  FileText,
  File,
  LibraryBig,
  Images,
  Palette,
  Paintbrush,
  Navigation2,
  Package,
  Users,
  UserPlus,
  ShieldCheck,
  Settings,
  SlidersHorizontal,
  Search,
  Wrench,
  HardDrive,
  History,
  Activity,
} as const;

export function resolveLucideIcon(name?: string | null): LucideIcon {
  const key = String(name || "").trim();
  return ICON_MAP[key] ?? Package;
}

// ---------------------------------------------------------------------------
// Menu node → nav item conversion
// ---------------------------------------------------------------------------

export function buildNavItemsFromMenuNodes(nodes: AdminMenuNodeEffective[]): AdminNavItem[] {
  const walk = (n: AdminMenuNodeEffective): AdminNavItem => {
    const children = (n.children ?? []).map(walk);
    return {
      key: n.code,
      label: n.title,
      ...(n.titleI18n ? { labelKey: n.titleI18n } : {}),
      ...(n.path ? { to: n.path } : {}),
      icon: resolveLucideIcon(n.icon),
      disabled: !n.allowed,
      blockedReason: n.blockedReason ?? null,
      requiredPermission: n.requiredPermission ?? null,
      ownerPluginId: n.ownerPluginId ?? null,
      ...(children.length ? { children } : {}),
    };
  };

  return (nodes ?? []).map(walk);
}

// ---------------------------------------------------------------------------
// Path matching utilities
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Active navigation trail (DFS best-match)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Organization nav path mapping
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Workspace route permission prefixes
// ---------------------------------------------------------------------------

export function collectAllowedWorkspacePathPrefixes(
  items: AdminNavItem[],
  workspaceBase: string,
): string[] {
  const base = normalizePath(workspaceBase);
  const prefixes = new Set<string>();

  prefixes.add(base);
  // Keep legacy workspace-scoped notifications URL reachable so route-level redirect can run.
  prefixes.add(normalizePath(`${base}/notifications`));
  // This route immediately redirects to the canonical org-scope path, but guard it as allowed
  // so the redirect can happen without being blocked.
  prefixes.add(normalizePath(`${base}/settings`));

  const walk = (nodes: AdminNavItem[]) => {
    for (const n of nodes) {
      // Route guard must not treat disabled items as allowed.
      if (n.to && !n.disabled) prefixes.add(normalizePath(n.to));
      if (n.children?.length) walk(n.children);
    }
  };
  walk(items);

  // Alias routes that are implemented as "index" pages but not necessarily present in seeds.
  // Only enable them when the corresponding module is visible in the menu.
  const hasTeam = Array.from(prefixes).some((p) => p.startsWith(normalizePath(`${base}/team/`)));
  if (hasTeam) prefixes.add(normalizePath(`${base}/team`));
  const hasPlugins = Array.from(prefixes).some((p) =>
    p.startsWith(normalizePath(`${base}/plugins/`)),
  );
  if (hasPlugins) prefixes.add(normalizePath(`${base}/plugins`));

  return Array.from(prefixes);
}

// ---------------------------------------------------------------------------
// Document title
// ---------------------------------------------------------------------------

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
