import type { ParsedLocation } from "@tanstack/react-router";

export const USERCENTER_OVERLAY_TABS = ["profile", "notifications"] as const;
export const WORKSPACE_SETTINGS_OVERLAY_TABS = [
  "workspace-general",
  "workspace-members",
  "workspace-invitations",
  "workspace-roles",
] as const;

export type UsercenterOverlayTab = (typeof USERCENTER_OVERLAY_TABS)[number];
export type WorkspaceSettingsOverlayTab = (typeof WORKSPACE_SETTINGS_OVERLAY_TABS)[number];
export type SettingsOverlayTab = UsercenterOverlayTab | WorkspaceSettingsOverlayTab;

export type RootUsercenterOverlaySearch = {
  personalSettings?: SettingsOverlayTab;
};

const USERCENTER_OVERLAY_TAB_SET = new Set<string>(USERCENTER_OVERLAY_TABS);
const WORKSPACE_SETTINGS_OVERLAY_TAB_SET = new Set<string>(WORKSPACE_SETTINGS_OVERLAY_TABS);

export function isUsercenterOverlayTab(value: unknown): value is UsercenterOverlayTab {
  return typeof value === "string" && USERCENTER_OVERLAY_TAB_SET.has(value);
}

export function isWorkspaceSettingsOverlayTab(
  value: unknown,
): value is WorkspaceSettingsOverlayTab {
  return typeof value === "string" && WORKSPACE_SETTINGS_OVERLAY_TAB_SET.has(value);
}

export function isSettingsOverlayTab(value: unknown): value is SettingsOverlayTab {
  return isUsercenterOverlayTab(value) || isWorkspaceSettingsOverlayTab(value);
}

export function validateRootUsercenterOverlaySearch(
  search: Record<string, unknown>,
): RootUsercenterOverlaySearch {
  return isSettingsOverlayTab(search.personalSettings)
    ? { personalSettings: search.personalSettings }
    : {};
}

export function buildUsercenterOverlayPath(tab: SettingsOverlayTab): string {
  if (tab === "workspace-general") return "/settings/workspace/general";
  if (tab === "workspace-members") return "/settings/workspace/members";
  if (tab === "workspace-invitations") return "/settings/workspace/invitations";
  if (tab === "workspace-roles") return "/settings/workspace/roles";
  return `/settings/personal/${tab}`;
}

export function resolveUsercenterOverlayTabFromPath(pathname: string): UsercenterOverlayTab | null {
  const normalizedPath = pathname.replace(/\/+$/, "");
  const tab = normalizedPath.slice("/settings/personal/".length);
  if (!normalizedPath.startsWith("/settings/personal/")) return null;
  return isUsercenterOverlayTab(tab) ? tab : null;
}

export function resolveWorkspaceSettingsOverlayTabFromPath(
  pathname: string,
): WorkspaceSettingsOverlayTab | null {
  const normalizedPath = pathname.replace(/\/+$/, "");
  if (normalizedPath === "/settings/workspace/general") return "workspace-general";
  if (normalizedPath === "/settings/workspace/members") return "workspace-members";
  if (normalizedPath === "/settings/workspace/invitations") return "workspace-invitations";
  if (normalizedPath === "/settings/workspace/roles") return "workspace-roles";
  return null;
}

export function resolveSettingsOverlayTabFromPath(pathname: string): SettingsOverlayTab | null {
  return (
    resolveUsercenterOverlayTabFromPath(pathname) ??
    resolveWorkspaceSettingsOverlayTabFromPath(pathname)
  );
}

type UsercenterOverlayNavigateOptions = {
  currentLocation: Pick<ParsedLocation, "pathname" | "hash">;
  tab: SettingsOverlayTab;
  replace?: boolean;
};

export function buildUsercenterOverlayNavigate(options: UsercenterOverlayNavigateOptions) {
  return {
    to: options.currentLocation.pathname,
    hash: options.currentLocation.hash,
    replace: options.replace,
    search: (prev: Record<string, unknown>) => ({
      ...prev,
      personalSettings: options.tab,
    }),
    mask: {
      to: buildUsercenterOverlayPath(options.tab),
    },
  };
}
