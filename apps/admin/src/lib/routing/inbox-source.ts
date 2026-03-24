import { isAccountPath, isGlobalPath } from "@/lib/routing/route-identity";
import { normalizePath } from "@/lib/admin-nav-utils";

export type InboxSourceKind = "workspace" | "global" | "account";

export type InboxSourceSearch = {
  sourceKind?: InboxSourceKind;
  sourcePath?: string;
};

function isValidRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

function isAllowedSourcePath(kind: InboxSourceKind, path: string): boolean {
  if (kind === "workspace") return path.startsWith("/w/");
  if (kind === "global") return isGlobalPath(path);
  return path.startsWith("/account/") || path === "/account";
}

export function validateInboxSourceSearch(search: Record<string, unknown>): InboxSourceSearch {
  const sourceKind =
    search.sourceKind === "workspace" ||
    search.sourceKind === "global" ||
    search.sourceKind === "account"
      ? search.sourceKind
      : undefined;
  const rawPath =
    typeof search.sourcePath === "string" && search.sourcePath.trim()
      ? search.sourcePath.trim()
      : undefined;

  if (!sourceKind || !rawPath) return {};
  if (!isValidRelativePath(rawPath)) return {};

  const sourcePath = normalizePath(rawPath);
  if (!isAllowedSourcePath(sourceKind, sourcePath)) return {};

  return { sourceKind, sourcePath };
}

export function buildInboxSourceSearch(pathname: string): InboxSourceSearch {
  const normalized = normalizePath(pathname);

  if (normalized.startsWith("/w/")) {
    return {
      sourceKind: "workspace",
      sourcePath: normalized,
    };
  }

  if (normalized.startsWith("/account") || isAccountPath(normalized)) {
    if (normalized.startsWith("/me/")) return {};
    return {
      sourceKind: "account",
      sourcePath: normalized,
    };
  }

  if (isGlobalPath(normalized)) {
    return {
      sourceKind: "global",
      sourcePath: normalized,
    };
  }

  return {};
}
