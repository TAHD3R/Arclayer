import type { CSSProperties, PropsWithChildren, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { getUnreadNotificationPreview } from "@/api/notifications";
import { ContentGuard, type ContentGuardProps } from "@/layouts/page-shell/content-guard";
import { AdminNotificationsShell } from "@/components/layout/admin-notifications-shell";
import { AdminSidebarShell } from "@/components/layout/admin-sidebar-shell";
import { RouteProgress } from "@/components/layout/route-progress";
import { RouteTransition } from "@/components/layout/route-transition";
import type { AdminNavItem } from "@/types/admin-nav";
import { useToggle } from "@arclayer/hooks/use-toggle";
import { SidebarInset, SidebarProvider } from "@arclayer/ui/sidebar";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";

const SIDEBAR_EXPANDED_WIDTH_PX = 240;
const SIDEBAR_COLLAPSED_WIDTH_PX = 56;
const TOPBAR_HEIGHT_REM = "3.5rem";

type AdminSceneTopbarRenderProps = {
  notificationOpen: boolean;
  showNotificationsBadge: boolean;
  unreadCount: number;
  onNotificationToggle: () => void;
};

type AdminSceneLayoutProps = PropsWithChildren<{
  notificationQueryScope: string;
  renderTopbar: (props: AdminSceneTopbarRenderProps) => ReactNode;
  mainItems: readonly AdminNavItem[];
  footerItems: readonly AdminNavItem[];
  favoriteWorkspaceBase?: string | null;
  resolvePermissionName?: (code: string) => string | null;
  showNavSkeleton?: boolean;
  showOrgNavErrorOverlay?: boolean;
  sidebarCollapsible?: "icon" | "none";
  sidebarPathnameOverride?: string;
  loading?: boolean;
  error?: unknown | null;
  onRetry?: () => void;
  guardContainer?: ContentGuardProps["container"];
  routeTransitionClassName?: string;
}>;

export function AdminSceneLayout({
  notificationQueryScope,
  renderTopbar,
  mainItems,
  footerItems,
  favoriteWorkspaceBase,
  resolvePermissionName,
  showNavSkeleton = false,
  showOrgNavErrorOverlay = false,
  sidebarCollapsible = "icon",
  sidebarPathnameOverride,
  loading = false,
  error = null,
  onRetry,
  guardContainer = "raw",
  routeTransitionClassName = "w-full",
  children,
}: AdminSceneLayoutProps) {
  const { t } = useTranslation(["notifications"]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const notificationPanelPinned = usePreferencesStore((s) => s.notificationPanelPinned);
  const showNotificationsBadge = usePreferencesStore((s) => s.showNotificationsBadge);
  const storedSidebarOpen = usePreferencesStore((s) => s.sidebarOpen);
  const setNotificationPanelPinned = usePreferencesStore((s) => s.setNotificationPanelPinned);
  const setSidebarOpen = usePreferencesStore((s) => s.setSidebarOpen);
  const [notificationPanelOpen, , setNotificationPanelOpen] = useToggle(false);
  const sidebarOpen = sidebarCollapsible === "none" ? true : storedSidebarOpen;

  const notificationPreviewQuery = useQuery({
    queryKey: ["notifications", "preview", notificationQueryScope, sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: () => getUnreadNotificationPreview({ limit: 1 }),
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  return (
    <SidebarProvider
      defaultOpen={sidebarOpen}
      open={sidebarOpen}
      onOpenChange={sidebarCollapsible === "none" ? () => undefined : setSidebarOpen}
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
        {renderTopbar({
          notificationOpen: notificationPanelOpen,
          showNotificationsBadge,
          unreadCount: notificationPreviewQuery.data?.unreadCount ?? 0,
          onNotificationToggle: () => setNotificationPanelOpen(!notificationPanelOpen),
        })}

        <div className="flex min-h-0 flex-1">
          <AdminSidebarShell
            showNavSkeleton={showNavSkeleton}
            showOrgNavErrorOverlay={showOrgNavErrorOverlay}
            mainItems={mainItems}
            favoriteWorkspaceBase={favoriteWorkspaceBase}
            footerItems={footerItems}
            resolvePermissionName={resolvePermissionName}
            pathnameOverride={sidebarPathnameOverride}
            collapsible={sidebarCollapsible}
            className="top-(--admin-topbar-height) inset-y-auto bottom-0 h-[calc(100svh-var(--admin-topbar-height))]"
          />

          <div className="relative flex min-w-0 flex-1">
            <SidebarInset className="w-auto flex-1 min-w-0 overflow-hidden bg-background">
              <div className="flex-1 min-h-0 overflow-auto">
                <ContentGuard
                  loading={loading}
                  error={error}
                  container={guardContainer}
                  onRetry={onRetry}
                  loadingVariant="form"
                >
                  <RouteTransition className={routeTransitionClassName}>{children}</RouteTransition>
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
