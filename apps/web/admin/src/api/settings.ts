import { api } from "@/lib/http";
import { workspacePath } from "@/api/workspace-path";

export type SettingsDetail = {
  namespace: string;
  value: Record<string, unknown>;
  secrets?: Record<string, boolean>;
  updated_at?: string | null;
};

export type SettingsFieldItem = {
  key: string;
  type: string;
  default?: unknown;
  secret?: boolean;
  ui?: Record<string, unknown> | null;
  label?: string | null;
  description?: string | null;
};

export type SettingsSectionItem = {
  id: string;
  title?: string | null;
  fields: SettingsFieldItem[];
};

export type SettingsSchemaItem = {
  sections: SettingsSectionItem[];
};

export type SystemSettingsDetail = {
  namespace: string;
  setting_schema: SettingsSchemaItem;
  value: Record<string, unknown>;
  secrets: Record<string, boolean>;
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

export async function getSystemSettingsNamespace(namespace: string): Promise<SystemSettingsDetail> {
  return api.get<SystemSettingsDetail>(`/system/settings/${encodeURIComponent(namespace)}`);
}

export async function patchSystemSettingsNamespace(
  namespace: string,
  patch: Record<string, unknown>,
): Promise<SystemSettingsDetail> {
  return api.patch<SystemSettingsDetail>(`/system/settings/${encodeURIComponent(namespace)}`, { patch });
}
