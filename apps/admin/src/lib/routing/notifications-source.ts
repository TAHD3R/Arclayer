import { isGlobalPath } from "@/lib/routing/route-identity";
import { normalizePath } from "@/lib/admin-nav-utils";

export type NotificationsSourceKind = "workspace" | "global" | "account";

export type NotificationsSourceSearch = {
  sourceKind?: NotificationsSourceKind;
  sourcePath?: string;
};

function isValidRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

function isAllowedSourcePath(kind: NotificationsSourceKind, path: string): boolean {
  if (kind === "workspace") return path.startsWith("/w/");
  if (kind === "global") return isGlobalPath(path);
  return path.startsWith("/usercenter/") || path === "/usercenter";
}

export function validateNotificationsSourceSearch(
  search: Record<string, unknown>,
): NotificationsSourceSearch {
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

export function buildNotificationsSourceSearch(pathname: string): NotificationsSourceSearch {
  const normalized = normalizePath(pathname);

  if (normalized.startsWith("/w/")) {
    return {
      sourceKind: "workspace",
      sourcePath: normalized,
    };
  }

  if (normalized.startsWith("/usercenter")) {
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
