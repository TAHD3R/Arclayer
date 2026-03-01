import type { ReactNode } from "react";

export type OrganizationWorkspacesTab = "active" | "archived";

export type OrganizationWorkspacesViewMode = "card" | "table";

export type OrganizationWorkspacesTranslateFn = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type WorkspaceMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
  type?: "divider";
};
