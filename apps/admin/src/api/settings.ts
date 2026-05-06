import { api } from "@/lib/http";
import { projectPath, workspacePath, systemSettingsPath } from "@/lib/api";
import type {
  ProjectSettingsDetail,
  ProjectSettingsPatch,
  SettingsDetail,
  SystemSettingsDetail,
} from "@arclayer/openapi/admin-types";

export async function getCoreSettings(workspaceId: string): Promise<SettingsDetail> {
  return api.get<SettingsDetail>(workspacePath(workspaceId, "/settings/core"));
}

export async function patchCoreSettings(
  workspaceId: string,
  patch: Record<string, unknown>,
): Promise<SettingsDetail> {
  return api.patch<SettingsDetail>(workspacePath(workspaceId, "/settings/core"), { patch });
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

/**
 * System-scoped settings (deployment-wide).
 *
 * Notes:
 * - Back-end is gated by org owner (not workspace RBAC).
 * - Response includes extra fields (e.g. settingSchema) but we only rely on value/secrets here.
 */
export async function getSystemCoreSettings(): Promise<SettingsDetail> {
  return api.get<SettingsDetail>("/system/settings/core");
}

export async function patchSystemCoreSettings(
  patch: Record<string, unknown>,
): Promise<SettingsDetail> {
  return api.patch<SettingsDetail>("/system/settings/core", { patch });
}

export async function getSystemSettingsNamespace(namespace: string): Promise<SystemSettingsDetail> {
  return api.get<SystemSettingsDetail>(systemSettingsPath(namespace));
}

export async function patchSystemSettingsNamespace(
  namespace: string,
  patch: Record<string, unknown>,
): Promise<SystemSettingsDetail> {
  return api.patch<SystemSettingsDetail>(systemSettingsPath(namespace), {
    patch,
  });
}
