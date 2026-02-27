import type { OrganizationPluginItem, WorkspacePluginItem } from "@/types/api";

export type ExtensionScope = "workspace" | "organization";
export type InstalledExtensionItem = WorkspacePluginItem | OrganizationPluginItem;

export interface ExtensionSearchOption {
  value: string;
  label: string;
  description?: string | null;
  iconUrl?: string | null;
}
