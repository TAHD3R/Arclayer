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
