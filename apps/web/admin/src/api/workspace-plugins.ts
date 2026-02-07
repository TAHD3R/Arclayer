import { api } from "@/lib/http";
import { workspacePath } from "@/api/workspace-path";

export type WorkspacePluginItem = {
  pluginId: string;
  slug?: string | null;
  name: string;
  description?: string | null;
  version: string;
  author: string;
  status: string;
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

export async function listWorkspacePlugins(workspaceId: string): Promise<WorkspacePluginList> {
  return api.get<WorkspacePluginList>(workspacePath(workspaceId, "/plugins-center"));
}

export async function installWorkspacePlugin(input: {
  workspaceId: string;
  file: File;
  checksum?: string | null;
  enableInWorkspace?: boolean;
}): Promise<WorkspacePluginInstallResult> {
  const { workspaceId, file, checksum, enableInWorkspace } = input;
  const fd = new FormData();
  fd.set("file", file);
  if (checksum) fd.set("checksum", checksum);
  fd.set("enable_in_workspace", String(enableInWorkspace ?? true));
  return api.post<WorkspacePluginInstallResult>(
    workspacePath(workspaceId, "/plugins-center/install"),
    fd,
  );
}

export async function enableWorkspacePlugin(
  workspaceId: string,
  pluginRef: string,
): Promise<WorkspacePluginItem> {
  return api.post<WorkspacePluginItem>(
    workspacePath(workspaceId, `/plugins-center/${encodeURIComponent(pluginRef)}/enable`),
  );
}

export async function disableWorkspacePlugin(
  workspaceId: string,
  pluginRef: string,
): Promise<WorkspacePluginItem> {
  return api.post<WorkspacePluginItem>(
    workspacePath(workspaceId, `/plugins-center/${encodeURIComponent(pluginRef)}/disable`),
  );
}

export async function uninstallWorkspacePlugin(
  workspaceId: string,
  pluginRef: string,
): Promise<void> {
  await api.post<null>(
    workspacePath(workspaceId, `/plugins-center/${encodeURIComponent(pluginRef)}/uninstall`),
  );
}

export async function resetWorkspacePluginConfig(
  workspaceId: string,
  pluginRef: string,
): Promise<void> {
  await api.post<null>(
    workspacePath(workspaceId, `/plugins-center/${encodeURIComponent(pluginRef)}/reset`),
  );
}
