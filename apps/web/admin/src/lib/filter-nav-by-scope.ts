import type { AdminNavItem } from "@/constants/admin-nav";
import type { DeploymentMode, DeploymentScope } from "@/types/api/system";

function isItemEnabled(item: AdminNavItem, mode: DeploymentMode): boolean {
  const scope: DeploymentScope = item.scope ?? "both";
  return scope === "both" || scope === mode;
}

function isItemNavigable(item: AdminNavItem): boolean {
  return Boolean(item.to || item.onAction || item.actionRenderer);
}

function filterItems(items: readonly AdminNavItem[], mode: DeploymentMode): AdminNavItem[] {
  const out: AdminNavItem[] = [];

  for (const item of items) {
    if (!isItemEnabled(item, mode)) continue;

    if (item.children && item.children.length > 0) {
      const nextChildren = filterItems(item.children, mode);

      if (nextChildren.length > 0) {
        out.push({ ...item, children: nextChildren });
        continue;
      }

      if (isItemNavigable(item)) {
        out.push({ ...item, children: undefined });
      }

      continue;
    }

    out.push(item);
  }

  return out;
}

/**
 * Filter admin navigation items by deployment scope.
 *
 * Notes:
 * - Items without `scope` or with `scope: "both"` are always visible.
 * - Items with `scope: "saas" | "self_host"` are only visible in that mode.
 * - Empty groups are removed unless the group itself is directly navigable.
 */
export function filterNavByScope(
  items: readonly AdminNavItem[],
  mode: DeploymentMode,
): AdminNavItem[] {
  return filterItems(items, mode);
}
