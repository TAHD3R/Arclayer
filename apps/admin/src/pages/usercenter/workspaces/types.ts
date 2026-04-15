import type { ReactNode } from "react";

import type { UserCenterWorkspaceListItem } from "./workspace-list-items";

export type UserCenterWorkspacesTab = "active" | "archived";

export type UserCenterWorkspacesViewMode = "card" | "table";

export type UserCenterWorkspacesTranslateFn = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type WorkspaceMenuItem =
  | {
      key: string;
      label: string;
      type: "divider";
    }
  | {
      key: string;
      label: string;
      icon?: ReactNode;
      disabled?: boolean;
      danger?: boolean;
      onClick?: () => void;
      children?: WorkspaceMenuItem[];
      type?: undefined;
    };

export type { UserCenterWorkspaceListItem };
