import { Outlet } from "@tanstack/react-router";
import { useMemo } from "react";

import { GlobalTopbar } from "@/components/layout/global-topbar";
import { COMMON_FOOTER_NAV_ITEMS } from "@/constants/menu/common";
import { GLOBAL_NAV_ITEMS } from "@/constants/menu/global";
import { AdminSceneLayout } from "@/layouts/admin-scene-layout";
import { buildCommonFooterItems } from "@/layouts/admin-scene-utils";

export function GlobalLayout() {
  const footerItems = useMemo(() => buildCommonFooterItems(COMMON_FOOTER_NAV_ITEMS), []);

  return (
    <AdminSceneLayout
      notificationQueryScope="global-shell"
      renderTopbar={(topbar) => <GlobalTopbar navItems={GLOBAL_NAV_ITEMS} {...topbar} />}
      mainItems={GLOBAL_NAV_ITEMS}
      footerItems={footerItems}
      sidebarCollapsible="none"
    >
      <Outlet />
    </AdminSceneLayout>
  );
}
