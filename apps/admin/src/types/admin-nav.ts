import type { ReactNode } from "react";
import type { DeploymentScope } from "@/types/api/system";
import type { LucideIcon } from "@arclayer/ui/icons/lucide-animated";

export type AdminNavItem = {
  key: string;
  label: string;
  labelKey?: string;
  to?: string;
  icon: LucideIcon;
  /** Control visibility by deployment mode; default: "both". */
  scope?: DeploymentScope;
  disabled?: boolean;
  blockedReason?: "missing_permission" | "plugin_disabled" | null;
  requiredPermission?: string | null;
  ownerPluginId?: string | null;
  children?: AdminNavItem[];
  position?: "main" | "footer";
  actionRenderer?: (item: AdminNavItem) => ReactNode;
  dividerAfter?: boolean;
  trailingIcon?: LucideIcon;
  onAction?: () => void;
  isActive?: boolean;
};

export type AdminNavSection = {
  key: string;
  title: string;
  titleKey?: string;
  items: AdminNavItem[];
};
