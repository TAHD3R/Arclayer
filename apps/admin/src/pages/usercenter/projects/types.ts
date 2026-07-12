import type { ReactNode } from "react";

import type { UserCenterProjectListItem } from "./project-list-items";

export type UserCenterProjectsTab = "active" | "archived";

export type UserCenterProjectsViewMode = "card" | "table";

export type UserCenterProjectsSortValue =
  | "-created_at"
  | "created_at"
  | "name"
  | "-name"
  | "member_count"
  | "-member_count";

export type UserCenterProjectsTranslateFn = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type ProjectMenuItem =
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
      children?: ProjectMenuItem[];
      type?: undefined;
    };

export type { UserCenterProjectListItem };
