import { cn } from "@arclayer/lib/utils";

import type { AdminNavItem } from "@/types/admin-nav";

export const NAV_ITEM_HEIGHT_CLASSNAME = "h-8";
export const NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME =
  "group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-1.5! group-data-[collapsible=icon]:mx-auto!";
export const NAV_ITEM_ROOT_INSET_CLASSNAME = "pl-4";
export const NAV_ROOT_MENU_GAP_CLASSNAME = "gap-1";
export const NAV_SECTION_CONTENT_PADDING_CLASSNAME = "pt-1";
export const NAV_SECTION_LABEL_SHELL_CLASSNAME = "relative h-8 overflow-hidden";
export const NAV_SECTION_LABEL_CLASSNAME = cn(
  "min-h-0 text-caption",
  "transition-opacity duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
  "group-data-[collapsible=icon]:opacity-0",
  "group-data-[collapsible=icon]:pointer-events-none",
);
export const NAV_SECTION_DIVIDER_CLASSNAME = cn(
  "pointer-events-none absolute -inset-x-2 top-1/2 h-px -translate-y-1/2 bg-border/70",
  "transition-opacity duration-220 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
  "opacity-0",
  "group-data-[collapsible=icon]:opacity-100",
);
export const NAV_SECTION_TRIGGER_CLASSNAME =
  "flex w-full items-center gap-1.5 pl-4 pr-2 text-left text-label-secondary";
export const NAV_SUBTREE_CLASSNAME = "mx-0 ml-4 gap-0.5 border-border/60";
export const NAV_DIVIDER_CLASSNAME = "mx-4 my-0.5";

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
