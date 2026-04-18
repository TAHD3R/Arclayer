import { buildFavoriteOverlaySearchUpdater } from "@/lib/routing/favorite-overlay";
import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

import type { WorkspaceSettingsTabNavigation } from "./types";

export function resolveWorkspaceSettingsTabNavigation(
  _workspaceId: string,
  tab: WorkspaceSettingsTabKey,
  currentSearchStr = "",
): WorkspaceSettingsTabNavigation {
  const search = buildFavoriteOverlaySearchUpdater(currentSearchStr);

  if (tab === "content") {
    return {
      to: "/settings/workspace/general",
      ...(search ? { search } : {}),
    };
  }
  if (tab === "danger") {
    return {
      to: "/settings/workspace/general",
      ...(search ? { search } : {}),
    };
  }
  return {
    to: "/settings/workspace/general",
    ...(search ? { search } : {}),
  };
}
