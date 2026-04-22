import { buildFavoriteOverlaySearchUpdater } from "@/lib/routing/favorite-overlay";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

import type { WorkspaceSettingsTabNavigation } from "./types";

export function resolveWorkspaceSettingsTabNavigation(
  projectId: string,
  tab: WorkspaceSettingsTabKey,
  currentSearchStr = "",
): WorkspaceSettingsTabNavigation {
  const search = buildFavoriteOverlaySearchUpdater(currentSearchStr);
  const to =
    tab === "content"
      ? "/projects/$projectId/content/general"
      : "/projects/$projectId/settings/general";
  const params = { projectId };
  return {
    to,
    params,
    ...(search ? { search } : {}),
  };
}
