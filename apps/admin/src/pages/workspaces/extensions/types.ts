import type { ReactNode } from "react";
import type { CapabilitySummary } from "@/types/api";

export type ExtensionScope = "workspace" | "organization";
export type InstalledExtensionItem = CapabilitySummary;

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
