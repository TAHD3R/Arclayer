import { api } from "@/lib/http";
import { workspacePath } from "@/lib/api";

import type { WorkspaceThemeItem, WorkspaceThemeListOut } from "@/types/api";

export async function listWorkspaceThemes(workspaceId: string): Promise<WorkspaceThemeListOut> {
  return api.get<WorkspaceThemeListOut>(workspacePath(workspaceId, "/themes"));
}

export async function importWorkspaceTheme(
  workspaceId: string,
  assetId: string,
): Promise<WorkspaceThemeItem> {
  return api.post<WorkspaceThemeItem>(workspacePath(workspaceId, "/themes/import"), { assetId });
}

export async function deleteWorkspaceTheme(
  workspaceId: string,
  themeId: string,
  version: string,
): Promise<void> {
  await api.delete(
    workspacePath(
      workspaceId,
      `/themes/${encodeURIComponent(themeId)}/${encodeURIComponent(version)}`,
    ),
  );
}
