import type { Role } from "@/types/api";

export type CreateRoleFormValues = {
  templateRoleCode: string;
  name: string;
  description: string;
};

export type EditRoleFormValues = {
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
