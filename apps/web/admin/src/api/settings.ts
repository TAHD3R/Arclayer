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
