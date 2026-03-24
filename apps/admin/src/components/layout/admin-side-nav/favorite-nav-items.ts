import type { TFunction } from "i18next";

import type { AdminNavItem } from "@/types/admin-nav";
import { normalizePath } from "./nav-utils";

export type FavoriteNavItem = {
  key: string;
  path: string;
  label: string;
  Icon: AdminNavItem["icon"];
  isCurrentWorkspace: boolean;
};

type FavoriteTemplate = {
  label: string;
  Icon: AdminNavItem["icon"];
};

type FavoriteTemplateIndex = {
  exactByPath: Map<string, FavoriteTemplate>;
  workspaceBySuffix: Map<string, FavoriteTemplate>;
};

function buildWorkspaceSuffix(path: string, workspaceBase: string): string | null {
  const normalizedPath = normalizePath(path);
  const normalizedBase = normalizePath(workspaceBase);
  if (normalizedPath === normalizedBase) return "/";
  if (normalizedPath.startsWith(`${normalizedBase}/`)) {
    return normalizedPath.slice(normalizedBase.length);
  }
  return null;
}

function parseWorkspaceSuffix(path: string): string | null {
  const normalizedPath = normalizePath(path);
  const match = /^\/w\/[^/]+(?:\/(.*))?$/.exec(normalizedPath);
  if (!match) return null;
  const suffix = match[1] ? `/${match[1]}` : "/";
  return normalizePath(suffix);
}

function buildTemplateIndex(
  items: readonly AdminNavItem[],
  t: TFunction,
  workspaceBase: string | null,
): FavoriteTemplateIndex {
  const exactByPath = new Map<string, FavoriteTemplate>();
  const workspaceBySuffix = new Map<string, FavoriteTemplate>();

  const walk = (nodes: readonly AdminNavItem[]) => {
    for (const item of nodes) {
      if (item.to) {
        const template = {
          label: item.labelKey ? t(item.labelKey) : item.label,
          Icon: item.icon,
        };
        const normalizedPath = normalizePath(item.to);
        exactByPath.set(normalizedPath, template);

        if (workspaceBase) {
          const suffix = buildWorkspaceSuffix(normalizedPath, workspaceBase);
          if (suffix) workspaceBySuffix.set(suffix, template);
        }
      }

      if (item.children?.length) walk(item.children);
    }
  };

  walk(items);
  return { exactByPath, workspaceBySuffix };
}

function isWithinWorkspace(path: string, workspaceBase: string | null): boolean {
  if (!workspaceBase) return false;
  return path === workspaceBase || path.startsWith(`${workspaceBase}/`);
}

export function resolveFavoriteNavItems(params: {
  favoritePaths: readonly string[];
  items: readonly AdminNavItem[];
  t: TFunction;
  workspaceBase?: string | null;
}): FavoriteNavItem[] {
  const workspaceBase = params.workspaceBase ? normalizePath(params.workspaceBase) : null;
  const templates = buildTemplateIndex(params.items, params.t, workspaceBase);

  return params.favoritePaths
    .map((path, order) => {
      const normalizedPath = normalizePath(path);
      const exactTemplate = templates.exactByPath.get(normalizedPath);
      const workspaceSuffix = parseWorkspaceSuffix(normalizedPath);
      const workspaceTemplate = workspaceSuffix
        ? templates.workspaceBySuffix.get(workspaceSuffix)
        : undefined;
      const template = exactTemplate ?? workspaceTemplate;

      if (!template) return null;

      return {
        key: `favorite:${normalizedPath}`,
        path: normalizedPath,
        label: template.label,
        Icon: template.Icon,
        isCurrentWorkspace: isWithinWorkspace(normalizedPath, workspaceBase),
        order,
      };
    })
    .filter((item): item is FavoriteNavItem & { order: number } => Boolean(item))
    .sort((left, right) => {
      if (left.isCurrentWorkspace !== right.isCurrentWorkspace) {
        return left.isCurrentWorkspace ? -1 : 1;
      }
      return left.order - right.order;
    })
    .map(({ order: _order, ...item }) => item);
}
