import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type AdminNavItem = {
  key: string;
  label: string;
  labelKey?: string;
  to?: string;
  icon: LucideIcon;
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
