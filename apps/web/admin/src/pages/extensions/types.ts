import type { OrganizationPluginItem, WorkspacePluginItem } from "@/types/api";

export type PluginScope = "workspace" | "organization";
export type InstalledPluginItem = WorkspacePluginItem | OrganizationPluginItem;

export interface PluginSearchOption {
  value: string;
  label: string;
  description?: string | null;
  iconUrl?: string | null;
}
