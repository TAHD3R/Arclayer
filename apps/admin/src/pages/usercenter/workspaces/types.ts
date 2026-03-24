import type { ReactNode } from "react";

export type UserCenterWorkspacesTab = "active" | "archived";

export type UserCenterWorkspacesViewMode = "card" | "table";

export type UserCenterWorkspacesTranslateFn = (
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
