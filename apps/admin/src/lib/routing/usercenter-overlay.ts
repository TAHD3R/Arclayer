import type { ParsedLocation } from "@tanstack/react-router";

export const USERCENTER_OVERLAY_TABS = ["profile", "preferences", "notifications"] as const;

export type UsercenterOverlayTab = (typeof USERCENTER_OVERLAY_TABS)[number];

export type RootUsercenterOverlaySearch = {
  personalSettings?: UsercenterOverlayTab;
};

const USERCENTER_OVERLAY_TAB_SET = new Set<string>(USERCENTER_OVERLAY_TABS);

export function isUsercenterOverlayTab(value: unknown): value is UsercenterOverlayTab {
  return typeof value === "string" && USERCENTER_OVERLAY_TAB_SET.has(value);
}

export function validateRootUsercenterOverlaySearch(
  search: Record<string, unknown>,
): RootUsercenterOverlaySearch {
  return isUsercenterOverlayTab(search.personalSettings)
    ? { personalSettings: search.personalSettings }
    : {};
}

export function buildUsercenterOverlayPath(tab: UsercenterOverlayTab): string {
  return `/settings/personal/${tab}`;
}

export function resolveUsercenterOverlayTabFromPath(pathname: string): UsercenterOverlayTab | null {
  const normalizedPath = pathname.replace(/\/+$/, "");
  const tab = normalizedPath.slice("/settings/personal/".length);
  if (!normalizedPath.startsWith("/settings/personal/")) return null;
  return isUsercenterOverlayTab(tab) ? tab : null;
}

type UsercenterOverlayNavigateOptions = {
  currentLocation: Pick<ParsedLocation, "pathname" | "hash">;
  tab: UsercenterOverlayTab;
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
