import type { TFunction } from "i18next";
import { ChevronRight } from "lucide-react";

import { PROJECT_NAV_ITEMS } from "@/constants/menu/project";
import { normalizeLegacyProjectSettingsPath } from "@/lib/routing/legacy-project-settings-paths";
import type { FavoriteNode } from "@/types/stores/favorites";
import type { AdminNavItem } from "@/types/admin-nav";
import { normalizePath } from "./nav-utils";

export type FavoriteNavLeaf = {
  type: "item";
  key: string;
  path: string;
  label: string;
  Icon: AdminNavItem["icon"];
  isCurrentWorkspace: boolean;
};

export type FavoriteNavFolder = {
  type: "folder";
  key: string;
  id: string;
  name: string;
  expanded: boolean;
  children: FavoriteNavNode[];
};

export type FavoriteNavNode = FavoriteNavLeaf | FavoriteNavFolder;

type FavoriteTemplate = {
  label: string;
  Icon: AdminNavItem["icon"];
};

type FavoriteTemplateIndex = {
  exactByPath: Map<string, FavoriteTemplate>;
  workspaceBySuffix: Map<string, FavoriteTemplate>;
};

export type FavoriteDynamicLabelIndex = ReadonlyMap<string, string>;

type FavoriteTemplateMatch = {
  path: string;
  template: FavoriteTemplate;
};

function findNearestAncestorTemplate(
  key: string | null,
  index: Map<string, FavoriteTemplate>,
): FavoriteTemplateMatch | undefined {
  let current = key;
  while (current) {
    const found = index.get(current);
    if (found) {
      return {
        path: current,
        template: found,
      };
    }
    const nextSlash = current.lastIndexOf("/");
    if (nextSlash <= 0) return undefined;
    current = current.slice(0, nextSlash);
  }
  return undefined;
}

function parseWorkspaceSuffix(path: string): string | null {
  const normalizedPath = normalizePath(toPathname(path));
  const match = /^\/(?:w|projects)\/[^/]+(?:\/(.*))?$/.exec(normalizedPath);
  if (!match) return null;
  const suffix = match[1] ? `/${match[1]}` : "/";
  return normalizePath(suffix);
}

function parseWorkspaceBase(path: string): string | null {
  const normalizedPath = normalizePath(toPathname(path));
  const match = /^\/(?:w|projects)\/([^/]+)/.exec(normalizedPath);
  return match?.[1] ? `/projects/${match[1]}` : null;
}

function toPathname(path: string): string {
  return path.split(/[?#]/, 1)[0] || path;
}

function normalizeComparablePath(path: string): string {
  const pathname = toPathname(path);
  const suffix = path.slice(pathname.length);
  return `${normalizePath(pathname)}${suffix}`;
}

function buildTemplateIndex(items: readonly AdminNavItem[], t: TFunction): FavoriteTemplateIndex {
  const exactByPath = new Map<string, FavoriteTemplate>();
  const workspaceBySuffix = new Map<string, FavoriteTemplate>();

  const walk = (nodes: readonly AdminNavItem[]) => {
    for (const item of nodes) {
      const template = {
        label: item.labelKey ? t(item.labelKey) : item.label,
        Icon: item.icon,
      };
      const candidates = [item.to, ...(item.activeMatchPaths ?? [])].filter(
        (value): value is string => Boolean(value),
      );
      for (const candidate of candidates) {
        exactByPath.set(normalizePath(candidate), template);
      }

      if (item.children?.length) walk(item.children);
    }
  };

  walk(items);

  const workspaceWalk = (nodes: readonly AdminNavItem[]) => {
    for (const item of nodes) {
      const template = {
        label: item.labelKey ? t(item.labelKey) : item.label,
        Icon: item.icon,
      };
      const candidates = [item.to, ...(item.activeMatchPaths ?? [])].filter(
        (value): value is string => Boolean(value),
      );
      for (const candidate of candidates) {
        workspaceBySuffix.set(normalizePath(candidate), template);
      }
      if (item.children?.length) workspaceWalk(item.children);
    }
  };

  workspaceWalk(PROJECT_NAV_ITEMS);
  return { exactByPath, workspaceBySuffix };
}

function isWithinWorkspace(path: string, workspaceBase: string | null): boolean {
  if (!workspaceBase) return false;
  const pathname = toPathname(path);
  const pathWorkspaceBase = parseWorkspaceBase(pathname);
  if (pathWorkspaceBase) return pathWorkspaceBase === workspaceBase;
  return pathname === workspaceBase || pathname.startsWith(`${workspaceBase}/`);
}

function resolveFavoriteItem(
  path: string,
  templates: FavoriteTemplateIndex,
  workspaceBase: string | null,
  dynamicLabels?: FavoriteDynamicLabelIndex,
): FavoriteNavLeaf | null {
  const normalizedPath = normalizeLegacyProjectSettingsPath(path);
  const normalizedPathname = normalizeLegacyProjectSettingsPath(toPathname(path));
  const globalExactTemplate = templates.exactByPath.get(normalizedPathname);
  const globalAncestorTemplate = findNearestAncestorTemplate(
    normalizedPathname,
    templates.exactByPath,
  );
  const workspaceSuffix = parseWorkspaceSuffix(normalizedPathname);
  const workspaceTemplate = workspaceSuffix
    ? (templates.workspaceBySuffix.get(workspaceSuffix) ??
      findNearestAncestorTemplate(workspaceSuffix, templates.workspaceBySuffix)?.template)
    : undefined;
  const workspaceBasePath = parseWorkspaceBase(normalizedPathname);
  const globalAncestorWorkspaceBase = globalAncestorTemplate?.path
    ? parseWorkspaceBase(globalAncestorTemplate.path)
    : null;
  const preferWorkspaceTemplate =
    Boolean(workspaceTemplate) &&
    Boolean(workspaceBasePath) &&
    globalAncestorWorkspaceBase === workspaceBasePath &&
    normalizedPathname !== workspaceBasePath;
  const template =
    globalExactTemplate ??
    (preferWorkspaceTemplate ? workspaceTemplate : undefined) ??
    globalAncestorTemplate?.template ??
    workspaceTemplate;

  if (!template) return null;

  return {
    type: "item",
    key: `favorite:${normalizedPath}`,
    path: normalizedPath,
    label: dynamicLabels?.get(normalizedPath) ?? template.label,
    Icon: template.Icon,
    isCurrentWorkspace: isWithinWorkspace(normalizedPath, workspaceBase),
  };
}

export function resolveFavoriteNavItems(params: {
  favorites: readonly FavoriteNode[];
  items: readonly AdminNavItem[];
  t: TFunction;
  workspaceBase?: string | null;
  dynamicLabels?: FavoriteDynamicLabelIndex;
}): FavoriteNavNode[] {
  const workspaceBase = params.workspaceBase
    ? (parseWorkspaceBase(params.workspaceBase) ?? normalizePath(params.workspaceBase))
    : null;
  const templates = buildTemplateIndex(params.items, params.t);

  const walk = (nodes: readonly FavoriteNode[]): FavoriteNavNode[] => {
    const next: FavoriteNavNode[] = [];
    const resolvedPaths = new Set<string>();
    for (const node of nodes) {
      if (node.type === "item") {
        const resolved = resolveFavoriteItem(
          node.path,
          templates,
          workspaceBase,
          params.dynamicLabels,
        );
        if (resolved && !resolvedPaths.has(resolved.path)) {
          resolvedPaths.add(resolved.path);
          next.push(resolved);
        }
        continue;
      }

      next.push({
        type: "folder",
        key: `favorite-folder:${node.id}`,
        id: node.id,
        name: node.name,
        expanded: node.expanded,
        children: walk(node.children),
      });
    }
    return next;
  };

  return walk(params.favorites);
}

export function flattenFavoriteNavItems(nodes: readonly FavoriteNavNode[]): FavoriteNavLeaf[] {
  const items: FavoriteNavLeaf[] = [];
  const walk = (entries: readonly FavoriteNavNode[]) => {
    for (const entry of entries) {
      if (entry.type === "item") {
        items.push(entry);
        continue;
      }
      walk(entry.children);
    }
  };
  walk(nodes);
  return items;
}

function favoriteNodeMatchesPath(node: FavoriteNavNode, currentPath: string): boolean {
  if (node.type === "item") {
    const nodeHasQuery = node.path.includes("?") || node.path.includes("#");
    const expected = nodeHasQuery
      ? normalizeComparablePath(node.path)
      : normalizePath(toPathname(node.path));
    const actual = nodeHasQuery
      ? normalizeComparablePath(currentPath)
      : normalizeLegacyProjectSettingsPath(toPathname(currentPath));
    return expected === actual;
  }
  return node.children.some((child) => favoriteNodeMatchesPath(child, currentPath));
}

export function buildFavoriteAdminChildren(
  nodes: readonly FavoriteNavNode[],
  currentPath: string,
): AdminNavItem[] {
  return nodes.map((node) => {
    if (node.type === "item") {
      return {
        key: node.key,
        label: node.label,
        icon: node.Icon,
        to: node.path,
        isActive: favoriteNodeMatchesPath(node, currentPath),
      };
    }

    return {
      key: node.key,
      label: node.name,
      icon: ChevronRight,
      children: buildFavoriteAdminChildren(node.children, currentPath),
      isActive: node.children.some((child) => favoriteNodeMatchesPath(child, currentPath)),
    };
  });
}

export function favoriteNavItemMatchesPath(item: FavoriteNavLeaf, currentPath: string): boolean {
  return favoriteNodeMatchesPath(item, currentPath);
}
