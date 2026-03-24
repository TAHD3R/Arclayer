import { Outlet } from "@tanstack/react-router";
import { type CSSProperties, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getUnreadNotificationPreview } from "@/api/notifications";
import { ContentGuard } from "@/components/common/content-guard";
import { AdminNotificationsShell } from "@/components/layout/admin-notifications-shell";
import { AdminSidebarShell } from "@/components/layout/admin-sidebar-shell";
import { GlobalTopbar } from "@/components/layout/global-topbar";
import { RouteProgress } from "@/components/layout/route-progress";
import { RouteTransition } from "@/components/layout/route-transition";
import { COMMON_FOOTER_NAV_ITEMS } from "@/constants/menu/common";
import { GLOBAL_NAV_ITEMS } from "@/constants/menu/global";
import { useToggle } from "@arclayer/hooks/use-toggle";
import { SidebarInset, SidebarProvider } from "@arclayer/ui/sidebar";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";

const SIDEBAR_EXPANDED_WIDTH_PX = 240;
const SIDEBAR_COLLAPSED_WIDTH_PX = 56;
const TOPBAR_HEIGHT_REM = "3.5rem";

function buildGlobalFooterItems() {
  return COMMON_FOOTER_NAV_ITEMS.flatMap((item) => {
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
  });
}

function GlobalLayoutFrame(props: {
  footerItems: ReturnType<typeof buildGlobalFooterItems>;
  notificationPanelOpen: boolean;
  notificationPanelPinned: boolean;
  showNotificationsBadge: boolean;
  unreadCount: number;
  closeAriaLabel: string;
  onNotificationToggle: () => void;
  onPinnedChange: (next: boolean) => void;
  onPanelClose: () => void;
}) {
  return (
    <div className="flex h-screen min-h-0 w-full flex-1 flex-col bg-background">
      <GlobalTopbar
        navItems={GLOBAL_NAV_ITEMS}
        notificationOpen={props.notificationPanelOpen}
        showNotificationsBadge={props.showNotificationsBadge}
        unreadCount={props.unreadCount}
        onNotificationToggle={props.onNotificationToggle}
      />

      <div className="flex min-h-0 flex-1">
        <AdminSidebarShell
          showNavSkeleton={false}
          showOrgNavErrorOverlay={false}
          mainItems={GLOBAL_NAV_ITEMS}
          favoriteWorkspaceBase={null}
          footerItems={props.footerItems}
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
            open={props.notificationPanelOpen}
            pinned={props.notificationPanelPinned}
            closeAriaLabel={props.closeAriaLabel}
            onPinnedChange={props.onPinnedChange}
            onClose={props.onPanelClose}
          />
        </div>
      </div>
    </div>
  );
}

export function GlobalLayout() {
  const { t } = useTranslation(["notifications"]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const notificationPanelPinned = usePreferencesStore((s) => s.notificationPanelPinned);
  const showNotificationsBadge = usePreferencesStore((s) => s.showNotificationsBadge);
  const sidebarOpen = usePreferencesStore((s) => s.sidebarOpen);
  const setNotificationPanelPinned = usePreferencesStore((s) => s.setNotificationPanelPinned);
  const setSidebarOpen = usePreferencesStore((s) => s.setSidebarOpen);
  const [notificationPanelOpen, , setNotificationPanelOpen] = useToggle(false);

  const notificationPreviewQuery = useQuery({
    queryKey: ["notifications", "preview", "global-shell", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: () => getUnreadNotificationPreview({ limit: 1 }),
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  const footerItems = useMemo(buildGlobalFooterItems, []);

  return (
    <SidebarProvider
      defaultOpen={sidebarOpen}
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
      <GlobalLayoutFrame
        footerItems={footerItems}
        notificationPanelOpen={notificationPanelOpen}
        notificationPanelPinned={notificationPanelPinned}
        showNotificationsBadge={showNotificationsBadge}
        unreadCount={notificationPreviewQuery.data?.unreadCount ?? 0}
        closeAriaLabel={t("notifications:NOTIFICATIONS_PANEL_CLOSE")}
        onNotificationToggle={() => setNotificationPanelOpen(!notificationPanelOpen)}
        onPinnedChange={setNotificationPanelPinned}
        onPanelClose={() => setNotificationPanelOpen(false)}
      />
    </SidebarProvider>
  );
}
