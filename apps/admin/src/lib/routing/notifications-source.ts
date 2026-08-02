import { isGlobalPath } from "@/lib/routing/route-identity";
import type { SettingsScreen } from "@/lib/settings/settings-screen";
import { normalizePath } from "@/lib/admin-nav-utils";

export type NotificationsSourceKind = "workspace" | "global" | "personal";

type WorkspaceOrGlobalNotificationsSource = {
  sourceKind?: "workspace" | "global";
  sourcePath?: string;
  sourceScreen?: never;
};

type PersonalNotificationsSource = {
  sourceKind?: "personal";
  sourceScreen?: SettingsScreen;
  sourcePath?: never;
};

type NotificationsDetailSearch = {
  ticketId?: string;
};

export type NotificationsSourceSearch =
  | (WorkspaceOrGlobalNotificationsSource & NotificationsDetailSearch)
  | (PersonalNotificationsSource & NotificationsDetailSearch);

const PERSONAL_NOTIFICATIONS_SCREENS = new Set<SettingsScreen>([
  "personal.profile",
  "personal.preferences",
  "personal.notifications",
]);
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/u;

function isValidRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

function isAllowedSourcePath(kind: NotificationsSourceKind, path: string): boolean {
  if (kind === "workspace") return path.startsWith("/projects/");
  if (kind === "global") return isGlobalPath(path);
  return false;
}

function isPersonalNotificationsScreen(value: unknown): value is SettingsScreen {
  return typeof value === "string" && PERSONAL_NOTIFICATIONS_SCREENS.has(value as SettingsScreen);
}

export function validateNotificationsSourceSearch(
  search: Record<string, unknown>,
): NotificationsSourceSearch {
  const ticketId =
    typeof search.ticketId === "string" && PUBLIC_ID_PATTERN.test(search.ticketId.trim())
      ? search.ticketId.trim()
      : undefined;
  const sourceKind =
    search.sourceKind === "workspace" ||
    search.sourceKind === "global" ||
    search.sourceKind === "personal"
      ? search.sourceKind
      : undefined;

  if (!sourceKind) return ticketId ? { ticketId } : {};

  if (sourceKind === "personal") {
    return isPersonalNotificationsScreen(search.sourceScreen)
      ? { sourceKind, sourceScreen: search.sourceScreen, ticketId }
      : ticketId
        ? { ticketId }
        : {};
  }

  const rawPath =
    typeof search.sourcePath === "string" && search.sourcePath.trim()
      ? search.sourcePath.trim()
      : undefined;

  if (!rawPath || !isValidRelativePath(rawPath)) return ticketId ? { ticketId } : {};

  const sourcePath = normalizePath(rawPath);
  if (!isAllowedSourcePath(sourceKind, sourcePath)) return ticketId ? { ticketId } : {};

  return { sourceKind, sourcePath, ticketId };
}

export function parseNotificationsSourceSearch(searchStr: string): NotificationsSourceSearch {
  const raw = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  const params = new URLSearchParams(raw);

  return validateNotificationsSourceSearch({
    sourceKind: params.get("sourceKind") ?? undefined,
    sourcePath: params.get("sourcePath") ?? undefined,
    sourceScreen: params.get("sourceScreen") ?? undefined,
    ticketId: params.get("ticketId") ?? undefined,
  });
}

export function resolveNotificationsSourcePath(pathname: string, searchStr: string): string | null {
  if (normalizePath(pathname) !== "/notifications") return null;
  const source = parseNotificationsSourceSearch(searchStr);
  return source.sourcePath ?? null;
}

export function buildNotificationsSourceSearch(
  pathname: string,
  options: { settingsScreen?: SettingsScreen } = {},
): NotificationsSourceSearch {
  const normalized = normalizePath(pathname);

  if (normalized.startsWith("/projects/")) {
    return {
      sourceKind: "workspace",
      sourcePath: normalized,
    };
  }

  if (options.settingsScreen && PERSONAL_NOTIFICATIONS_SCREENS.has(options.settingsScreen)) {
    return {
      sourceKind: "personal",
      sourceScreen: options.settingsScreen,
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
