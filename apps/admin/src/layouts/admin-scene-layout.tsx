import type { CSSProperties, PropsWithChildren, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { getUnreadNotificationPreview } from "@/api/notifications";
import { NotificationToastContent } from "@/components/common/notification-toast-content";
import { ContentGuard, type ContentGuardProps } from "@/layouts/page-shell/content-guard";
import {
  AdminSidebarShell,
  type SidebarBrowseProject,
} from "@/components/layout/admin-sidebar-shell";
import { useNotificationActions } from "@/hooks/use-notification-actions";
import { RouteTransition } from "@/components/layout/route-transition";
import type { AdminNavItem } from "@/types/admin-nav";
import { SidebarInset, SidebarProvider } from "@arclayer/ui/sidebar";
import { message } from "@arclayer/ui/admin-toast";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type { CommandScope } from "@/lib/command/command-types";

const SIDEBAR_COLLAPSED_WIDTH_PX = 56;
const NOTIFICATION_TOAST_PREVIEW_LIMIT = 20;
type AdminSceneLayoutProps = PropsWithChildren<{
  renderTopbar: () => ReactNode;
  mainItems: readonly AdminNavItem[];
  commandScope?: CommandScope;
  browseProjects?: readonly SidebarBrowseProject[];
  activeBrowseProjectId?: string | null;
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
  renderTopbar,
  mainItems,
  commandScope,
  browseProjects,
  activeBrowseProjectId,
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
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const showNotificationsBadge = usePreferencesStore((s) => s.showNotificationsBadge);
  const storedSidebarOpen = usePreferencesStore((s) => s.sidebarOpen);
  const sidebarWidthPx = usePreferencesStore((s) => s.sidebarWidthPx);
  const setSidebarOpen = usePreferencesStore((s) => s.setSidebarOpen);
  const setSidebarWidthPx = usePreferencesStore((s) => s.setSidebarWidthPx);
  const sidebarOpen = sidebarCollapsible === "none" ? true : storedSidebarOpen;
  const hasHydratedNotificationPreviewRef = useRef(false);
  const seenNotificationPreviewIdsRef = useRef<Set<string>>(new Set());
  const { archiveItem, deleteItem, markRead, openTarget } = useNotificationActions();

  const notificationPreviewQuery = useQuery({
    queryKey: ["notifications", "preview", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: () => getUnreadNotificationPreview({ limit: NOTIFICATION_TOAST_PREVIEW_LIMIT }),
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  useEffect(() => {
    hasHydratedNotificationPreviewRef.current = false;
    seenNotificationPreviewIdsRef.current = new Set();
  }, [accessToken, sessionVersion]);

  useEffect(() => {
    const preview = notificationPreviewQuery.data;
    if (!preview) return;

    const latestIds = new Set(preview.items.map((item) => item.id));
    if (!hasHydratedNotificationPreviewRef.current) {
      hasHydratedNotificationPreviewRef.current = true;
      seenNotificationPreviewIdsRef.current = latestIds;
      return;
    }

    const nextUnreadItems = preview.items.filter(
      (item) => !seenNotificationPreviewIdsRef.current.has(item.id),
    );

    for (const item of nextUnreadItems.reverse()) {
      let toastId: string | number | undefined;
      const dismissToast = () => {
        if (toastId === undefined) return;
        toast.dismiss(toastId);
      };

      toastId = message.info(
        {
          title: (
            <button
              type="button"
              className="block min-w-0 max-w-full truncate text-left text-headline font-semibold text-label-primary transition-colors hover:text-primary"
              onClick={() => {
                void (async () => {
                  if (await openTarget(item)) {
                    dismissToast();
                  }
                })();
              }}
            >
              {item.title}
            </button>
          ),
          description: (
            <NotificationToastContent
              item={item}
              showTitle={false}
              onOpenTarget={async () => {
                if (await openTarget(item)) {
                  dismissToast();
                }
              }}
              onMarkRead={
                item.readAt
                  ? undefined
                  : async () => {
                      if (await markRead(item)) {
                        dismissToast();
                      }
                    }
              }
              onArchive={
                item.archivedAt
                  ? undefined
                  : async () => {
                      if (await archiveItem(item)) {
                        dismissToast();
                      }
                    }
              }
              onDelete={async () => {
                if (await deleteItem(item)) {
                  dismissToast();
                }
              }}
            />
          ),
        },
        {
          duration: 12_000,
        },
      );
    }

    seenNotificationPreviewIdsRef.current = new Set([
      ...seenNotificationPreviewIdsRef.current,
      ...latestIds,
    ]);
  }, [archiveItem, deleteItem, markRead, notificationPreviewQuery.data, openTarget]);

  return (
    <SidebarProvider
      defaultOpen={sidebarOpen}
      open={sidebarOpen}
      onOpenChange={sidebarCollapsible === "none" ? () => undefined : setSidebarOpen}
      defaultWidthPx={sidebarWidthPx}
      widthPx={sidebarWidthPx}
      onWidthChange={setSidebarWidthPx}
      className="h-screen overflow-hidden"
      style={
        {
          "--sidebar-width-icon": `${SIDEBAR_COLLAPSED_WIDTH_PX}px`,
        } as CSSProperties
      }
    >
      <div className="flex h-screen min-h-0 w-full flex-1 bg-background">
        <AdminSidebarShell
          showNavSkeleton={showNavSkeleton}
          showOrgNavErrorOverlay={showOrgNavErrorOverlay}
          mainItems={mainItems}
          commandScope={commandScope}
          browseProjects={browseProjects}
          activeBrowseProjectId={activeBrowseProjectId}
          favoriteWorkspaceBase={favoriteWorkspaceBase}
          resolvePermissionName={resolvePermissionName}
          pathnameOverride={sidebarPathnameOverride}
          showInboxBadge={showNotificationsBadge}
          unreadInboxCount={notificationPreviewQuery.data?.unreadCount ?? 0}
          collapsible={sidebarCollapsible}
        />

        <div className="relative flex min-w-0 flex-1 flex-col">
          {renderTopbar()}

          <div className="relative flex min-h-0 flex-1">
            <SidebarInset className="w-auto flex-1 min-w-0 overflow-hidden bg-background">
              <div className="flex min-h-0 flex-1 flex-col overflow-auto">
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
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
