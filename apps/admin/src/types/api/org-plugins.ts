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
