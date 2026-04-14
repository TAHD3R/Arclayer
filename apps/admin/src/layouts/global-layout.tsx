import { Outlet } from "@tanstack/react-router";
import { useMemo } from "react";

import { AdminTopbar } from "@/components/layout/admin-topbar";
import { COMMON_FOOTER_NAV_ITEMS } from "@/constants/menu/common";
import { resolveGlobalNavItems } from "@/constants/menu/global";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import { AdminSceneLayout } from "@/layouts/admin-scene-layout";
import { buildCommonFooterItems } from "@/layouts/admin-scene-utils";

const GLOBAL_COMMAND_SCOPE = {
  kind: "none",
  pathname: "/",
  workspaceId: null,
  organizationId: null,
} as const;

export function GlobalLayout() {
  const { isSuperAdmin } = useCurrentUserProfile();
  const footerItems = useMemo(() => buildCommonFooterItems(COMMON_FOOTER_NAV_ITEMS), []);
  const navItems = useMemo(() => resolveGlobalNavItems({ isSuperAdmin }), [isSuperAdmin]);

  return (
    <AdminSceneLayout
      notificationQueryScope="global-shell"
      renderTopbar={(topbar) => (
        <AdminTopbar
          navItems={navItems}
          commandScope={GLOBAL_COMMAND_SCOPE}
          notificationOpen={topbar.notificationOpen}
          showNotificationsBadge={topbar.showNotificationsBadge}
          unreadCount={topbar.unreadCount}
          onNotificationToggle={topbar.onNotificationToggle}
          leadingMode="logo"
          sidebarToggleMode="mobile-only"
        />
      )}
      mainItems={navItems}
      footerItems={footerItems}
      sidebarCollapsible="icon"
    >
      <Outlet />
    </AdminSceneLayout>
  );
}
