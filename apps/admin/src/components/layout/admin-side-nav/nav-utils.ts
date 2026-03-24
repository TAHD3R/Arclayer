import { cn } from "@arclayer/lib/utils";

import type { AdminNavItem } from "@/types/admin-nav";

export const NAV_ITEM_HEIGHT_CLASSNAME = "h-9";
export const NAV_ITEM_RADIUS_CLASSNAME = "rounded-md";
export const NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME =
  "group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:mx-auto!";
export const NAV_ITEM_BUTTON_PADDING_CLASSNAME = "!pl-3 !pr-2.5 !py-1.5";
export const NAV_ROOT_MENU_GAP_CLASSNAME = "gap-1.5 group-data-[collapsible=icon]:gap-2.5";
export const NAV_SUBTREE_CLASSNAME = "mx-0 ml-0 gap-1 pl-7 border-l-0";
export const NAV_SUBTREE_GUIDE_CLASSNAME = cn(
  "relative",
  "before:pointer-events-none before:absolute before:bottom-2 before:left-4 before:top-1.5 before:w-px before:bg-border/60",
);
export const NAV_DIVIDER_CLASSNAME = "mx-4 my-1";

function normalizePath(input: string): string {
  if (input.length > 1 && input.endsWith("/")) return input.slice(0, -1);
  return input;
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

      if (node.to) {
        const isExact = isExactMatch(node.to, pathname);
        const isTrail = isPrefixMatch(node.to, pathname);
        const score = isExact ? 1000 + node.to.length : isTrail ? 100 + node.to.length : 0;
        if (score > 0 && score > bestScore) {
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

export type OpenByParent = Record<string, string | undefined>;

export {
  buildNavIndex,
  findActiveTrail,
  findPreferredGroupTarget,
  getFirstDescendantTo,
  isExactMatch,
  isPrefixMatch,
  normalizePath,
};
