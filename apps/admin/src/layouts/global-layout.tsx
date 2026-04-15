import { Outlet, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import { AdminTopbar } from "@/components/layout/admin-topbar";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { RouteTransition } from "@/components/layout/route-transition";
import { COMMON_FOOTER_NAV_ITEMS } from "@/constants/menu/common";
import { resolveGlobalNavItems } from "@/constants/menu/global";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import { isFavoriteOverlayContentOnly } from "@/lib/routing/favorite-overlay";
import { AdminSceneLayout } from "@/layouts/admin-scene-layout";
import { buildCommonFooterItems } from "@/layouts/admin-scene-utils";
import { SidebarInset, SidebarProvider } from "@arclayer/ui/sidebar";

const GLOBAL_COMMAND_SCOPE = {
  kind: "none",
  pathname: "/",
  workspaceId: null,
  organizationId: null,
} as const;

export function GlobalLayout() {
  const searchStr = useRouterState({
    select: (s) => s.location.searchStr,
    structuralSharing: true,
  });
  const { isSuperAdmin } = useCurrentUserProfile();
  const footerItems = useMemo(() => buildCommonFooterItems(COMMON_FOOTER_NAV_ITEMS), []);
  const navItems = useMemo(() => resolveGlobalNavItems({ isSuperAdmin }), [isSuperAdmin]);
  const contentOnlyMode = isFavoriteOverlayContentOnly(searchStr);

  if (contentOnlyMode) {
    return (
      <SidebarProvider
        open
        defaultOpen
        onOpenChange={() => undefined}
        className="h-screen overflow-hidden"
      >
        <div className="flex h-screen min-h-0 w-full flex-1 flex-col bg-background">
          <div className="relative flex min-h-0 flex-1">
            <SidebarInset className="w-auto min-w-0 flex-1 overflow-hidden bg-background">
              <div className="flex-1 min-h-0 overflow-auto">
                <ContentGuard loading={false} error={null} container="raw" loadingVariant="form">
                  <RouteTransition className="h-full min-h-0 w-full">
                    <Outlet />
                  </RouteTransition>
                </ContentGuard>
              </div>
            </SidebarInset>
          </div>
        </div>
      </SidebarProvider>
    );
  }

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
