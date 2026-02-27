export type WorkspacePluginItem = {
  pluginId: string;
  managementScope?: "workspace" | "organization" | (string & {});
  slug?: string | null;
  name: string;
  description?: string | null;
  version: string;
  requires?: string | null;
  author: string;
  license?: string | null;
  status: string;
  category?: string | null;
  hasConfigSchema?: boolean;
  iconUrl?: string | null;
  enabled: boolean;
  config?: Record<string, unknown> | null;
};

export type WorkspacePluginList = {
  items: WorkspacePluginItem[];
};

export type WorkspacePluginInstallResult = {
  plugin: WorkspacePluginItem;
  requiresRestart: boolean;
};

export type WorkspacePluginPackageMeta = {
  pluginId: string;
  slug: string;
  name: string;
  description?: string | null;
  author: string;
  version: string;
  requires: string;
  category?: string | null;
  icon?: string | null;
  hasConfigSchema: boolean;
  permissionsCount: number;
  modelsCount: number;
};

export type WorkspacePluginPackageValidateOut = {
  token: string;
  sha256: string;
  sizeBytes: number;
  meta: WorkspacePluginPackageMeta;
};
