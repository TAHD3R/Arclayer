import type { WorkspaceSettingsTabKey } from "@/types/settings-workspace";

import type { WorkspaceSettingsTabNavigation } from "./types";

export function resolveWorkspaceSettingsTabNavigation(
  workspaceId: string,
  tab: WorkspaceSettingsTabKey,
): WorkspaceSettingsTabNavigation {
  if (tab === "content") {
    return {
      to: "/w/$workspaceId/settings/workspace/content",
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
