import { buildFavoriteOverlaySearchUpdater } from "@/lib/routing/favorite-overlay";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

import type { WorkspaceSettingsTabNavigation } from "./types";

export function resolveWorkspaceSettingsTabNavigation(
  workspaceId: string,
  tab: WorkspaceSettingsTabKey,
  currentSearchStr = "",
): WorkspaceSettingsTabNavigation {
  const search = buildFavoriteOverlaySearchUpdater(currentSearchStr);

  if (tab === "content") {
    return {
      to: "/w/$workspaceId/settings/workspace/content",
      params: { workspaceId },
      ...(search ? { search } : {}),
    };
  }
  if (tab === "danger") {
    return {
      to: "/w/$workspaceId/settings/workspace/danger",
      params: { workspaceId },
      ...(search ? { search } : {}),
    };
  }
  return {
    to: "/w/$workspaceId/settings/workspace/basics",
    params: { workspaceId },
    ...(search ? { search } : {}),
  };
}
