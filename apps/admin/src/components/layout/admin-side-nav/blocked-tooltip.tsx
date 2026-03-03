import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import type { AdminNavItem } from "@/types/admin-nav";
import { Tooltip, TooltipContent, TooltipTrigger } from "@celestial/ui/tooltip";

function getBlockedTooltipText(
  item: AdminNavItem,
  t: (key: string, opts?: Record<string, unknown>) => string,
  resolvePermissionName: ((code: string) => string | null) | undefined,
): string | null {
  if (!item.disabled) return null;
  if (item.blockedReason === "plugin_disabled") {
    return t("admin_menu:MENU_BLOCKED_PLUGIN_DISABLED");
  }
  if (item.blockedReason === "missing_permission") {
    const permCode = item.requiredPermission || "admin:access";
    const permissionName = resolvePermissionName?.(permCode) ?? null;
    if (permissionName) {
      return t("admin_menu:MENU_BLOCKED_MISSING_PERMISSION", { permissionName });
    }
    return t("admin_menu:MENU_BLOCKED_MISSING_PERMISSION_FALLBACK");
  }
  return t("admin_menu:MENU_BLOCKED_GENERIC");
}

function WithBlockedTooltip(props: { tooltip: string | null; children: ReactElement }) {
  if (!props.tooltip) return props.children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block w-full">{props.children}</span>
      </TooltipTrigger>
      <TooltipContent>{props.tooltip}</TooltipContent>
    </Tooltip>
  );
}

function useBlockedTooltipText(
  item: AdminNavItem,
  resolvePermissionName: ((code: string) => string | null) | undefined,
) {
  const { t } = useTranslation(["admin_menu"]);
  return getBlockedTooltipText(item, t, resolvePermissionName);
}

export { WithBlockedTooltip, getBlockedTooltipText, useBlockedTooltipText };
