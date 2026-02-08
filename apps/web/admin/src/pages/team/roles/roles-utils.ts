import type { AdminMenuNode } from "@/api/admin-menus";
import type { Role } from "@/api/rbac";

export type MenuScopeCheckedState = boolean | "indeterminate";

export type CreateRoleFormValues = {
  templateRoleCode: string;
  name: string;
  description: string;
};

export function normalizeNeedle(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase();
}

export function includesText(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  const value = String(haystack || "").toLowerCase();
  return value.includes(needle);
}

export function sortByName(roles: Role[]): Role[] {
  return [...roles].sort((a, b) => a.name.localeCompare(b.name));
}

export function normalizePermissionCode(input: unknown): string | null {
  const value = typeof input === "string" ? input.trim() : "";
  return value ? value : null;
}

export function collectMenuPermissionCodes(nodes: AdminMenuNode[] | undefined | null): Set<string> {
  const output = new Set<string>();
  const walk = (items: AdminMenuNode[]) => {
    for (const node of items) {
      const code = normalizePermissionCode(node.permissionCode);
      if (code) output.add(code);
      if (node.children?.length) walk(node.children);
    }
  };
  if (nodes?.length) walk(nodes);
  return output;
}

export function collectDescendantPermissionCodes(node: AdminMenuNode): Set<string> {
  const output = new Set<string>();
  const walk = (item: AdminMenuNode) => {
    const code = normalizePermissionCode(item.permissionCode);
    if (code) output.add(code);
    for (const child of item.children ?? []) walk(child);
  };
  walk(node);
  return output;
}
