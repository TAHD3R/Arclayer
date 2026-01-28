import { api } from "@/lib/http";

export type SettingsDetail = {
  namespace: string;
  value: Record<string, unknown>;
  updated_at?: string | null;
};

export async function getSettingsNamespace(namespace: string): Promise<SettingsDetail> {
  return api.get<SettingsDetail>(`/admin/settings/${namespace}`);
}

export async function getCoreSettings(): Promise<SettingsDetail> {
  return getSettingsNamespace("core");
}

export async function patchSettingsNamespace(
  namespace: string,
  patch: Record<string, unknown>,
): Promise<SettingsDetail> {
  return api.patch<SettingsDetail>(`/admin/settings/${namespace}`, { patch });
}

export async function patchCoreSettings(patch: Record<string, unknown>): Promise<SettingsDetail> {
  return patchSettingsNamespace("core", patch);
}
