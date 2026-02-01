import { api } from "@/lib/http";
import { workspacePath } from "@/api/_workspace";

export type SettingsDetail = {
  namespace: string;
  value: Record<string, unknown>;
  secrets?: Record<string, boolean>;
  updated_at?: string | null;
};

export async function getCoreSettings(workspaceId: string): Promise<SettingsDetail> {
  return api.get<SettingsDetail>(workspacePath(workspaceId, "/settings/core"));
}

export async function patchCoreSettings(
  workspaceId: string,
  patch: Record<string, unknown>,
): Promise<SettingsDetail> {
  return api.patch<SettingsDetail>(workspacePath(workspaceId, "/settings/core"), { patch });
}

/**
 * System-scoped settings (deployment-wide).
 *
 * Notes:
 * - Back-end is gated by org owner (not workspace RBAC).
 * - Response includes extra fields (e.g. setting_schema) but we only rely on value/secrets here.
 */
export async function getSystemCoreSettings(): Promise<SettingsDetail> {
  return api.get<SettingsDetail>("/system/settings/core");
}

export async function patchSystemCoreSettings(
  patch: Record<string, unknown>,
): Promise<SettingsDetail> {
  return api.patch<SettingsDetail>("/system/settings/core", { patch });
}
