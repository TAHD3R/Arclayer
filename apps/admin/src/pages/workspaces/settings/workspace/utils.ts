import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

import type { WorkspaceSettingsTabNavigation } from "./types";

export function resolveWorkspaceSettingsTabNavigation(
  workspaceId: string,
  tab: WorkspaceSettingsTabKey,
): WorkspaceSettingsTabNavigation {
  if (tab === "content_strategy") {
    return {
      to: "/w/$workspaceId/settings/workspace/content-strategy",
      params: { workspaceId },
    };
  }
  if (tab === "danger") {
    return {
      to: "/w/$workspaceId/settings/workspace/danger",
      params: { workspaceId },
    };
  }
  return {
    to: "/w/$workspaceId/settings/workspace/basics",
    params: { workspaceId },
  };
}

export function buildWorkspacePortalUrl(workspaceSlug: string | null | undefined): string {
  const slug = String(workspaceSlug || "").trim();
  const origin = (import.meta.env.VITE_PORTAL_ORIGIN || "http://localhost:3100")
    .trim()
    .replace(/\/+$/, "");
  if (!slug) return origin;
  return `${origin}/w/${encodeURIComponent(slug)}`;
}
