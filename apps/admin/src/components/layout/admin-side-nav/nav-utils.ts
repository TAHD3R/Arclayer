import type { AdminNavItem } from "@/types/admin-nav";

export const NAV_ITEM_HEIGHT_CLASSNAME = "h-10";
export const NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME =
  "group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:mx-auto";

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
  getFirstDescendantTo,
  isExactMatch,
  isPrefixMatch,
  normalizePath,
};
