import { api } from "@/lib/http";
import { projectPath, workspacePath } from "@/lib/api";
import type {
  ProjectSettingsDetail,
  ProjectSettingsPatch,
  WorkspaceSettingsDetail,
} from "@arclayer/openapi/admin-types";

export async function getCoreSettings(workspaceId: string): Promise<WorkspaceSettingsDetail> {
  return api.get<WorkspaceSettingsDetail>(workspacePath(workspaceId, "/settings/core"));
}

export async function patchCoreSettings(
  workspaceId: string,
  patch: Record<string, unknown>,
): Promise<WorkspaceSettingsDetail> {
  return api.patch<WorkspaceSettingsDetail>(workspacePath(workspaceId, "/settings/core"), {
    patch,
  });
}

export async function getProjectCoreSettings(projectId: string): Promise<ProjectSettingsDetail> {
  return api.get<ProjectSettingsDetail>(projectPath(projectId, "/settings/core"));
}

export async function patchProjectCoreSettings(
  projectId: string,
  patch: ProjectSettingsPatch["patch"],
): Promise<ProjectSettingsDetail> {
  return api.patch<ProjectSettingsDetail>(projectPath(projectId, "/settings/core"), { patch });
}
