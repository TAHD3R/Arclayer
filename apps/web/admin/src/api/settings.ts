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
