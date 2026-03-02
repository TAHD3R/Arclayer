import type { OrganizationPluginItem, WorkspacePluginItem } from "@/types/api";
import type { ReactNode } from "react";

export type ExtensionScope = "workspace" | "organization";
export type InstalledExtensionItem = WorkspacePluginItem | OrganizationPluginItem;

export type ExtensionMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  type?: "divider";
};

export interface ExtensionSearchOption {
  value: string;
  label: string;
  description?: string | null;
  iconUrl?: string | null;
}
