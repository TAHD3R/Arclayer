import { buildFavoriteOverlaySearchUpdater } from "@/lib/routing/favorite-overlay";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

import type { WorkspaceSettingsTabNavigation } from "./types";

export function resolveWorkspaceSettingsTabNavigation(
  workspaceId: string,
  tab: WorkspaceSettingsTabKey,
  currentSearchStr = "",
): WorkspaceSettingsTabNavigation {
  const search = buildFavoriteOverlaySearchUpdater(currentSearchStr);
  const to = "/projects/$projectId/settings/general";
  const params = { projectId: workspaceId };

  if (tab === "content") {
    return {
      to,
      params,
      ...(search ? { search } : {}),
    };
  }
  return {
    to,
    params,
    ...(search ? { search } : {}),
  };
}
