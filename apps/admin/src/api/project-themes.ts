import { api } from "@/lib/http";
import { projectPath } from "@/lib/api";

import type { WorkspaceThemeItem, WorkspaceThemeListOut } from "@/types/api";

export async function listProjectThemes(projectId: string): Promise<WorkspaceThemeListOut> {
  return api.get<WorkspaceThemeListOut>(projectPath(projectId, "/themes"));
}

export async function importProjectTheme(
  projectId: string,
  assetId: string,
): Promise<WorkspaceThemeItem> {
  return api.post<WorkspaceThemeItem>(projectPath(projectId, "/themes/import"), { assetId });
}

export async function deleteProjectTheme(
  projectId: string,
  themeId: string,
  version: string,
): Promise<void> {
  await api.delete(
    projectPath(projectId, `/themes/${encodeURIComponent(themeId)}/${encodeURIComponent(version)}`),
  );
}
