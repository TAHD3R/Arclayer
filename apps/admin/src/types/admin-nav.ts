import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type NavSearch = Record<string, unknown>;

export type AdminNavItem = {
  key: string;
  label: string;
  labelKey?: string;
  to?: string;
  activeMatchPaths?: string[];
  search?: NavSearch;
  icon: LucideIcon;
  disabled?: boolean;
  blockedReason?: "missing_permission" | null;
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
