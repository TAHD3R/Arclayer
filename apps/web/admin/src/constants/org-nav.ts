import type { LucideIcon } from "lucide-react";
import { History, Settings } from "lucide-react";

import type { AdminNavItem } from "@/constants/admin-nav";

export type OrgNavItem = {
  key: string;
  label: string;
  labelKey?: string;
  to?: string;
  icon: LucideIcon;
  children?: OrgNavItem[];
};

/**
 * 组织级菜单（不带 /w/:workspaceId 前缀）。
 *
 * 设计目标：
 * - 从信息架构上明确“组织治理”和“工作区治理”是两套 scope；
 * - 组织级页面不应通过工作区侧边栏轻易进入；
 * - 组织级路由必须是 canonical（不包含 /w）。
 */
export const ORG_NAV_ITEMS: AdminNavItem[] = [
  {
    key: "org",
    label: "Organization",
    labelKey: "nav:NAV_ORG",
    icon: Settings,
    children: [
      {
        key: "org.settings",
        label: "Organization settings",
        labelKey: "nav:NAV_ORG_SETTINGS",
        to: "/settings/organization",
        icon: Settings,
      },
      {
        key: "org.activity",
        label: "Activity",
        labelKey: "nav:NAV_ORG_ACTIVITY",
        to: "/settings/organization/activity",
        icon: History,
      },
    ],
  },
] as const;
