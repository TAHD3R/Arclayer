import { api } from "@/lib/http";
import { orgPluginPath } from "@/lib/api";

import type {
  SystemSettingsDetail,
  OrganizationPluginItem,
  OrganizationPluginListOut,
} from "@/types/api";

export async function listOrganizationPlugins(): Promise<OrganizationPluginListOut> {
  return api.get<OrganizationPluginListOut>(orgPluginPath());
}

export async function enableOrganizationPlugin(pluginRef: string): Promise<OrganizationPluginItem> {
  return api.post<OrganizationPluginItem>(`${orgPluginPath(pluginRef)}/enable`);
}

export async function disableOrganizationPlugin(
  pluginRef: string,
): Promise<OrganizationPluginItem> {
  return api.post<OrganizationPluginItem>(`${orgPluginPath(pluginRef)}/disable`);
}

export async function getOrganizationPluginSettings(
  pluginRef: string,
): Promise<SystemSettingsDetail> {
  return api.get<SystemSettingsDetail>(`${orgPluginPath(pluginRef)}/settings`);
}

export async function patchOrganizationPluginSettings(
  pluginRef: string,
  patch: Record<string, unknown>,
): Promise<SystemSettingsDetail> {
  return api.patch<SystemSettingsDetail>(`${orgPluginPath(pluginRef)}/settings`, { patch });
}

export async function resetOrganizationPluginConfig(pluginRef: string): Promise<void> {
  await api.post<null>(`${orgPluginPath(pluginRef)}/reset`);
}

export async function uninstallOrganizationPlugin(pluginRef: string): Promise<void> {
  await api.post<null>(`${orgPluginPath(pluginRef)}/uninstall`);
}
