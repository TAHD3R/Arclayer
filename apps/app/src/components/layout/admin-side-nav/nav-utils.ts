import { cn } from "@arclayer/lib/utils";

import { navSectionCollapseKey } from "@/stores/use-sidebar-nav-store";
import type { AdminNavItem } from "@/types/admin-nav";

export const NAV_ITEM_HEIGHT_CLASSNAME = "h-10";
export const NAV_ITEM_RADIUS_CLASSNAME = "rounded-md";
export const NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME =
  "[[data-layout-collapsible=icon]:not([data-hover-preview=true])[data-motion-phase=idle]_&]:!px-1.5 [[data-layout-collapsible=icon]:not([data-hover-preview=true])[data-motion-phase=idle]_&]:!py-1.5 [[data-layout-collapsible=icon]:not([data-hover-preview=true])[data-motion-phase=idle]_&]:justify-center";
export const NAV_ITEM_BUTTON_PADDING_CLASSNAME = "!px-2.5 !py-1.5";
export const NAV_ROOT_MENU_GAP_CLASSNAME = "gap-1 group-data-[collapsible=icon]:gap-1";
export const NAV_SUBTREE_CLASSNAME = "mx-0 ml-0 gap-1 pl-7 border-l-0";
export const NAV_SUBTREE_GUIDE_CLASSNAME = cn("relative");
export const NAV_DIVIDER_CLASSNAME = "mx-4 my-1 group-data-[collapsible=icon]:mx-1.5";
export const NAV_TRAILING_RAIL_CLASSNAME =
  "ml-auto flex shrink-0 items-center self-center [[data-layout-collapsible=icon]:not([data-hover-preview=true])_&]:ml-0";
export const NAV_TRAILING_ICON_SLOT_CLASSNAME = "inline-flex size-6 items-center justify-center";

function resolveLeadingLabel(item: AdminNavItem, t: (key: string) => string): string | null {
  if (item.groupLabelBeforeKey) return t(item.groupLabelBeforeKey);
  return item.groupLabelBefore ?? null;
}

function resolveNavSectionKey(parentKey: string, item: AdminNavItem): string {
  const labelIdentity = item.groupLabelBeforeKey ?? item.groupLabelBefore;
  if (!labelIdentity)
    throw new Error(`Navigation section ${item.key} is missing its label identity`);
  return navSectionCollapseKey(`${parentKey}:${labelIdentity}`);
}

function normalizePath(input: string): string {
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

function isExactMatch(to: string, pathname: string): boolean {
  const t = normalizePath(to);
  const p = normalizePath(pathname);
  return p === t;
}

function isPrefixMatch(to: string, pathname: string): boolean {
  const t = normalizePath(to);
  const p = normalizePath(pathname);
  if (t === "/") return p === "/";
  return p === t || p.startsWith(`${t}/`);
}

function getFirstDescendantTo(item: AdminNavItem): string | null {
  if (item.to && !item.disabled) return item.to;
  if (!item.children?.length) return null;
  for (const child of item.children) {
    const found = getFirstDescendantTo(child);
    if (found) return found;
  }
  return null;
}

function findFirstActiveDescendantTo(
  items: readonly AdminNavItem[],
  activeKeys: ReadonlySet<string>,
): string | null {
  for (const item of items) {
    if (item.children?.length) {
      const activeChild = findFirstActiveDescendantTo(item.children, activeKeys);
      if (activeChild) return activeChild;
    }
    if (item.to && !item.disabled && activeKeys.has(item.key)) {
      return item.to;
    }
  }
  return null;
}

function findPreferredGroupTarget(
  item: AdminNavItem,
  activeKeys: ReadonlySet<string>,
): string | null {
  const activeDescendant = findFirstActiveDescendantTo(item.children ?? [], activeKeys);
  if (activeDescendant) return activeDescendant;
  return getFirstDescendantTo(item);
}

function findActiveTrail(items: readonly AdminNavItem[], pathname: string): string[] {
  let bestScore = -1;
  let bestKeys: string[] = [];

  const dfs = (nodes: readonly AdminNavItem[], parents: string[]) => {
    for (const node of nodes) {
      const nextParents = [...parents, node.key];

      const candidates = getMatchCandidates(node);
      for (const candidate of candidates) {
        const isExact = isExactMatch(candidate, pathname);
        const isTrail = isPrefixMatch(candidate, pathname);
        const score = isExact ? 1000 + candidate.length : isTrail ? 100 + candidate.length : 0;
        const isMoreSpecificTrail = score === bestScore && nextParents.length > bestKeys.length;
        if (score > 0 && (score > bestScore || isMoreSpecificTrail)) {
          bestScore = score;
          bestKeys = nextParents;
        }
      }

      if (node.children?.length) dfs(node.children, nextParents);
    }
  };

  dfs(items, []);
  return bestKeys;
}

export type NavIndexEntry = {
  key: string;
  parentKey: string;
  isGroup: boolean;
};

function buildNavIndex(items: readonly AdminNavItem[]): Map<string, NavIndexEntry> {
  const index = new Map<string, NavIndexEntry>();
  const walk = (nodes: readonly AdminNavItem[], parentKey: string) => {
    for (const node of nodes) {
      index.set(node.key, { key: node.key, parentKey, isGroup: Boolean(node.children?.length) });
      if (node.children?.length) walk(node.children, node.key);
    }
  };
  walk(items, "__root__");
  return index;
}

function collectGroupKeys(items: readonly AdminNavItem[]): Set<string> {
  const groupKeys = new Set<string>();
  const walk = (nodes: readonly AdminNavItem[]) => {
    for (const node of nodes) {
      if (!node.children?.length) continue;
      groupKeys.add(node.key);
      walk(node.children);
    }
  };
  walk(items);
  return groupKeys;
}

function collectDefaultExpandedGroupKeys(items: readonly AdminNavItem[]): Set<string> {
  const groupKeys = new Set<string>();
  const walk = (nodes: readonly AdminNavItem[]) => {
    for (const node of nodes) {
      if (!node.children?.length) continue;
      if (node.defaultExpanded !== false) groupKeys.add(node.key);
      walk(node.children);
    }
  };
  walk(items);
  return groupKeys;
}

export type OpenGroupKeys = ReadonlySet<string>;

export {
  buildNavIndex,
  collectDefaultExpandedGroupKeys,
  collectGroupKeys,
  findActiveTrail,
  findPreferredGroupTarget,
  getFirstDescendantTo,
  isExactMatch,
  isPrefixMatch,
  normalizePath,
  resolveLeadingLabel,
  resolveNavSectionKey,
};
