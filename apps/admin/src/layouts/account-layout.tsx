import { Outlet } from "@tanstack/react-router";
import { type CSSProperties, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getUnreadNotificationPreview } from "@/api/notifications";
import { ContentGuard } from "@/components/common/content-guard";
import { ACCOUNT_NAV_SECTIONS } from "@/constants/menu/account";
import { COMMON_FOOTER_NAV_ITEMS } from "@/constants/menu/common";
import { AdminNotificationsShell } from "@/components/layout/admin-notifications-shell";
import { AdminSidebarShell } from "@/components/layout/admin-sidebar-shell";
import { RouteProgress } from "@/components/layout/route-progress";
import { RouteTransition } from "@/components/layout/route-transition";
import { AccountTopbar } from "@/components/layout/account-topbar";
import { useToggle } from "@arclayer/hooks/use-toggle";
import { SidebarInset, SidebarProvider } from "@arclayer/ui/sidebar";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";

const SIDEBAR_EXPANDED_WIDTH_PX = 270;
const SIDEBAR_COLLAPSED_WIDTH_PX = 56;
const TOPBAR_HEIGHT_REM = "3.5rem";

export function AccountLayout() {
  const { t } = useTranslation(["notifications"]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const notificationPanelPinned = usePreferencesStore((s) => s.notificationPanelPinned);
  const showNotificationsBadge = usePreferencesStore((s) => s.showNotificationsBadge);
  const setNotificationPanelPinned = usePreferencesStore((s) => s.setNotificationPanelPinned);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notificationPanelOpen, , setNotificationPanelOpen] = useToggle(false);

  const notificationPreviewQuery = useQuery({
    queryKey: ["notifications", "preview", "account-shell", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: () => getUnreadNotificationPreview({ limit: 1 }),
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  const footerItems = useMemo(
    () =>
      COMMON_FOOTER_NAV_ITEMS.flatMap((item) => {
        if (item.key === "notifications") return [];
        if (item.key === "help-center") {
          return [
            Object.assign({}, item, {
              onAction: () => {
                window.location.assign("#");
              },
            }),
          ];
        }
        return [item];
      }),
    [],
  );

  return (
    <SidebarProvider
      defaultOpen
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="h-screen overflow-hidden"
      style={
        {
          "--sidebar-width": `${SIDEBAR_EXPANDED_WIDTH_PX}px`,
          "--sidebar-width-icon": `${SIDEBAR_COLLAPSED_WIDTH_PX}px`,
          "--admin-topbar-height": TOPBAR_HEIGHT_REM,
        } as CSSProperties
      }
    >
      <RouteProgress />
      <div className="flex h-screen min-h-0 w-full flex-1 flex-col bg-background">
        <AccountTopbar
          notificationOpen={notificationPanelOpen}
          showNotificationsBadge={showNotificationsBadge}
          unreadCount={notificationPreviewQuery.data?.unreadCount ?? 0}
          onNotificationToggle={() => setNotificationPanelOpen(!notificationPanelOpen)}
        />

        <div className="flex min-h-0 flex-1">
          <AdminSidebarShell
            showNavSkeleton={false}
            showOrgNavErrorOverlay={false}
            mainItems={ACCOUNT_NAV_SECTIONS.flatMap((section) => section.items)}
            mainHomeItem={null}
            mainSections={ACCOUNT_NAV_SECTIONS}
            favoriteWorkspaceBase={null}
            footerItems={footerItems}
            className="top-[var(--admin-topbar-height)] inset-y-auto bottom-0 h-[calc(100svh-var(--admin-topbar-height))]"
          />

          <div className="relative flex min-w-0 flex-1">
            <SidebarInset className="w-auto flex-1 min-w-0 overflow-hidden">
              <div className="flex-1 min-h-0 overflow-auto">
                <ContentGuard loading={false} loadingVariant="form">
                  <RouteTransition className="w-full">
                    <Outlet />
                  </RouteTransition>
                </ContentGuard>
              </div>
            </SidebarInset>

            <AdminNotificationsShell
              open={notificationPanelOpen}
              pinned={notificationPanelPinned}
              closeAriaLabel={t("notifications:NOTIFICATIONS_PANEL_CLOSE")}
              onPinnedChange={setNotificationPanelPinned}
              onClose={() => setNotificationPanelOpen(false)}
            />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
