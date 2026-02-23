import { api } from "@/lib/http";
import { workspacePath } from "@/api/workspace-path";

export type WorkspaceThemeItem = {
  themeId: string;
  version: string;
  name: string | null;
  description: string | null;
  artifactHash: string | null;
  artifactAssetId: string | null;
  tokensCssAssetId: string;
  baseCssAssetId: string | null;
  previewImageAssetId: string | null;
  presets: Record<string, unknown> | null;
  variants: Record<string, unknown> | null;
  manifest: Record<string, unknown>;
};

export type WorkspaceThemeListOut = {
  items: WorkspaceThemeItem[];
};

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
