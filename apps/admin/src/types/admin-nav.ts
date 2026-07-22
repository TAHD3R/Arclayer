import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type NavSearch = Record<string, unknown>;

export type AdminNavItem = {
  key: string;
  label: string;
  labelKey?: string;
  insertStarredAfter?: boolean;
  groupLabelBefore?: string;
  groupLabelBeforeKey?: string;
  renderLabel?: (item: AdminNavItem) => ReactNode;
  to?: string;
  groupBehavior?: "preferred-child" | "navigate-self-and-expand";
  defaultExpanded?: boolean;
  activeMatchPaths?: string[];
  search?: NavSearch;
  icon: LucideIcon;
  iconNode?: ReactNode;
  disabled?: boolean;
  blockedReason?: "missing_permission" | null;
  requiredPermission?: string | null;
  ownerKey?: string | null;
  children?: AdminNavItem[];
  position?: "main" | "footer";
  actionRenderer?: (item: AdminNavItem) => ReactNode;
  dividerBefore?: boolean;
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
