import { api } from "@/lib/http";

import type { SystemSettingsDetail } from "@/api/settings";

export type OrganizationPluginItem = {
  pluginId: string;
  managementScope: "organization" | "workspace" | (string & {});
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
};

export type OrganizationPluginListOut = {
  items: OrganizationPluginItem[];
};

function orgPluginPath(pluginRef?: string): string {
  if (!pluginRef) return "/organizations/current/plugins";
  return `/organizations/current/plugins/${encodeURIComponent(pluginRef)}`;
}

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
