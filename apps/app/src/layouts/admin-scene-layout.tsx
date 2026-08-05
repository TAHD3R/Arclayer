import type { CSSProperties, PropsWithChildren, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  getMyNotificationPreferences,
  getUnreadNotificationPreview,
  NOTIFICATION_PREFERENCES_QUERY_KEY,
} from "@/api/notifications";
import { AIDrawerOverlay } from "@/components/ai/ai-drawer-overlay";
import { ArclayerAssistantScope } from "@/components/ai/arclayer-assistant-scope";
import { NotificationToastContent } from "@/components/common/notification-toast-content";
import {
  getGlobalNotificationMeta,
  GlobalNotificationSurfaces,
} from "@/components/common/global-notification-surfaces";
import { ContentGuard, type ContentGuardProps } from "@/layouts/page-shell/content-guard";
import { AdminSidebarShell } from "@/components/layout/admin-sidebar-shell";
import type { FavoriteDynamicLabelIndex } from "@/components/layout/admin-side-nav/favorite-nav-items";
import type { SidebarBrowseProject } from "@/components/layout/project-browse-menu";
import { useNotificationActions } from "@/hooks/use-notification-actions";
import { RouteTransition } from "@/components/layout/route-transition";
import { useAiChatStore } from "@/stores/use-ai-chat-store";
import type { AdminNavItem } from "@/types/admin-nav";
import { SidebarInset, SidebarProvider } from "@arclayer/ui/sidebar";
import { message } from "@arclayer/ui/admin-toast";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { notifyError } from "@/lib/notifications";
import { playNotificationSound } from "@/lib/notifications/notification-sound";
import type { CommandScope } from "@/lib/command/command-types";
import { cn } from "@arclayer/lib/utils";

const SIDEBAR_COLLAPSED_WIDTH_PX = 56;
const NOTIFICATION_TOAST_PREVIEW_LIMIT = 20;
const AI_DRAWER_MIN_WIDTH_PX = 380;
const AI_DRAWER_PANEL_MARGIN_PX = 16;
const AI_DRAWER_LAYOUT_GUTTER_PX = 64;
type AdminSceneLayoutProps = PropsWithChildren<{
  renderTopbar: () => ReactNode;
  mainItems: readonly AdminNavItem[];
  commandScope?: CommandScope;
  browseProjects?: readonly SidebarBrowseProject[];
  activeBrowseProjectId?: string | null;
  favoriteWorkspaceBase?: string | null;
  favoriteDynamicLabels?: FavoriteDynamicLabelIndex;
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
  favoriteDynamicLabels,
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
  const { t } = useTranslation(["ai", "common", "account"]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const showNotificationsBadge = usePreferencesStore((s) => s.showNotificationsBadge);
  const storedSidebarOpen = usePreferencesStore((s) => s.sidebarOpen);
  const sidebarWidthPx = usePreferencesStore((s) => s.sidebarWidthPx);
  const aiDrawerWidthPx = usePreferencesStore((s) => s.aiDrawerWidthPx);
  const setSidebarOpen = usePreferencesStore((s) => s.setSidebarOpen);
  const setSidebarWidthPx = usePreferencesStore((s) => s.setSidebarWidthPx);
  const setAiDrawerWidthPx = usePreferencesStore((s) => s.setAiDrawerWidthPx);
  const aiDrawerOpen = useAiChatStore((s) => s.drawerOpen);
  const sidebarOpen =
    sidebarCollapsible === "none" ? true : aiDrawerOpen ? false : storedSidebarOpen;
  const sceneContainerRef = useRef<HTMLDivElement | null>(null);
  const hasHydratedNotificationPreviewRef = useRef(false);
  const seenNotificationPreviewIdsRef = useRef<Set<string>>(new Set());
  const hasReportedNotificationSoundErrorRef = useRef(false);
  const { archiveItem, deleteItem, markRead, openTarget, recordInteraction } =
    useNotificationActions();

  const getMaxAiDrawerWidth = useCallback(() => {
    const containerWidth = sceneContainerRef.current?.clientWidth ?? window.innerWidth;
    return Math.max(
      AI_DRAWER_MIN_WIDTH_PX,
      Math.floor((containerWidth - AI_DRAWER_LAYOUT_GUTTER_PX) / 2),
    );
  }, []);

  const clampAiDrawerWidth = useCallback(
    (widthPx: number) =>
      Math.min(Math.max(Math.round(widthPx), AI_DRAWER_MIN_WIDTH_PX), getMaxAiDrawerWidth()),
    [getMaxAiDrawerWidth],
  );
  const effectiveAiDrawerWidthPx = useMemo(
    () => clampAiDrawerWidth(aiDrawerWidthPx),
    [aiDrawerWidthPx, clampAiDrawerWidth],
  );

  const handleAiDrawerResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!aiDrawerOpen) return;
      if (event.button !== 0) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const containerRect = sceneContainerRef.current?.getBoundingClientRect();
        if (!containerRect) return;
        const nextWidth = containerRect.right - moveEvent.clientX - AI_DRAWER_PANEL_MARGIN_PX * 2;
        setAiDrawerWidthPx(clampAiDrawerWidth(nextWidth));
      };

      const finishResize = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", finishResize);
        window.removeEventListener("pointercancel", finishResize);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", finishResize);
      window.addEventListener("pointercancel", finishResize);
    },
    [aiDrawerOpen, clampAiDrawerWidth, setAiDrawerWidthPx],
  );

  const notificationPreviewQuery = useQuery({
    queryKey: ["notifications", "preview", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => {
      const preview = await getUnreadNotificationPreview({
        limit: NOTIFICATION_TOAST_PREVIEW_LIMIT,
      });
      if (!Array.isArray(preview.items)) {
        throw new Error("Invalid notification preview response");
      }
      return { ...preview, items: preview.items };
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    meta: { silent: true },
  });
  const notificationPreferencesQuery = useQuery({
    queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY,
    enabled: Boolean(accessToken),
    queryFn: getMyNotificationPreferences,
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  useEffect(() => {
    hasHydratedNotificationPreviewRef.current = false;
    seenNotificationPreviewIdsRef.current = new Set();
    hasReportedNotificationSoundErrorRef.current = false;
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

    const nextUnreadItems = preview.items.filter((item) => {
      if (seenNotificationPreviewIdsRef.current.has(item.id)) return false;
      const globalMeta = getGlobalNotificationMeta(item);
      return globalMeta === null || globalMeta.presentation === "toast";
    });

    const sound = notificationPreferencesQuery.data?.sound;
    if (nextUnreadItems.length > 0 && sound?.enabled) {
      void playNotificationSound(sound.tone).catch((error) => {
        if (hasReportedNotificationSoundErrorRef.current) return;
        hasReportedNotificationSoundErrorRef.current = true;
        notifyError(
          new Error(t("account:ME_NOTIFY_SOUND_PLAYBACK_FAILED"), {
            cause: error,
          }),
        );
      });
    }

    for (const item of nextUnreadItems.reverse()) {
      const globalMeta = getGlobalNotificationMeta(item);
      const campaignToast = globalMeta?.presentation === "toast" ? globalMeta : null;
      const campaignAction = campaignToast?.payload.action ?? null;
      let toastId: string | number | undefined;
      const dismissToast = () => {
        if (toastId === undefined) return;
        toast.dismiss(toastId);
      };
      const openToastTarget = async () => {
        if (campaignAction) {
          const opened =
            campaignAction.kind === "internal_route"
              ? await openTarget(item, { markRead: false, target: campaignAction.target })
              : window.open(campaignAction.target, "_blank", "noopener,noreferrer") !== null;
          if (!opened) return;
          await recordInteraction(item, "click");
        } else {
          if (campaignToast || !(await openTarget(item))) return;
        }
        dismissToast();
      };

      toastId = message.info(
        {
          title: campaignToast ? (
            campaignToast.payload.title
          ) : (
            <button
              type="button"
              className="block min-w-0 max-w-full truncate text-left text-headline font-semibold text-label-primary transition-colors hover:text-primary"
              onClick={() => {
                void openToastTarget();
              }}
            >
              {item.title}
            </button>
          ),
          description: (
            <NotificationToastContent
              item={item}
              showTitle={false}
              body={campaignToast ? (campaignToast.payload.body ?? null) : undefined}
              actionLabel={campaignAction?.label}
              onOpenTarget={campaignAction ? openToastTarget : undefined}
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
  }, [
    archiveItem,
    deleteItem,
    markRead,
    notificationPreviewQuery.data,
    notificationPreferencesQuery.data?.sound,
    openTarget,
    recordInteraction,
    t,
  ]);

  return (
    <ArclayerAssistantScope>
      {(assistantState) => (
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
          <div
            ref={sceneContainerRef}
            className={cn(
              "flex h-screen min-h-0 w-full flex-1 bg-background transition-colors duration-[250ms] ease-out",
              aiDrawerOpen && "min-[769px]:bg-muted/70",
            )}
          >
            <div
              className={cn(
                "relative flex min-w-0 flex-1 overflow-hidden border bg-background transition-[margin,border-radius,border-color] duration-[250ms] ease-out",
                aiDrawerOpen
                  ? "m-0 rounded-none border-transparent shadow-none min-[769px]:m-4 min-[769px]:rounded-3xl min-[769px]:border-border"
                  : "m-0 rounded-none border-transparent shadow-none",
              )}
              data-floating-panel-boundary={aiDrawerOpen ? "" : undefined}
            >
              <AdminSidebarShell
                assistantAvailable={assistantState.status === "ready"}
                showNavSkeleton={showNavSkeleton}
                showOrgNavErrorOverlay={showOrgNavErrorOverlay}
                mainItems={mainItems}
                commandScope={commandScope}
                browseProjects={browseProjects}
                activeBrowseProjectId={activeBrowseProjectId}
                favoriteWorkspaceBase={favoriteWorkspaceBase}
                favoriteDynamicLabels={favoriteDynamicLabels}
                resolvePermissionName={resolvePermissionName}
                pathnameOverride={sidebarPathnameOverride}
                showInboxBadge={showNotificationsBadge}
                unreadInboxCount={notificationPreviewQuery.data?.unreadCount ?? 0}
                collapsible={sidebarCollapsible}
                className={aiDrawerOpen ? "h-full" : undefined}
              />

              <div className="relative flex min-w-0 flex-1 flex-col">
                {renderTopbar()}
                <GlobalNotificationSurfaces
                  items={notificationPreviewQuery.data?.items ?? []}
                  onRecordInteraction={recordInteraction}
                  onOpenTarget={(item, target) => openTarget(item, { markRead: false, target })}
                />

                <div className="relative flex min-h-0 flex-1">
                  <SidebarInset className="w-auto flex-1 min-w-0 overflow-hidden bg-background">
                    <div
                      className={cn(
                        "flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden overflow-y-auto [scrollbar-gutter:auto]",
                        sidebarPathnameOverride === "/" && "scrollbar-none",
                      )}
                    >
                      <ContentGuard
                        loading={loading}
                        error={error}
                        container={guardContainer}
                        onRetry={onRetry}
                        loadingVariant="form"
                      >
                        <RouteTransition
                          className={cn("min-w-0 max-w-full", routeTransitionClassName)}
                        >
                          {children}
                        </RouteTransition>
                      </ContentGuard>
                    </div>
                  </SidebarInset>
                </div>
              </div>
              <button
                type="button"
                data-sidebar="rail"
                data-slot="sidebar-rail"
                aria-label={t("ai:AI_CHAT_RESIZE")}
                tabIndex={-1}
                onPointerDown={handleAiDrawerResizePointerDown}
                className={cn(
                  "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-[transform,background-color] ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 min-[769px]:flex",
                  "cursor-col-resize",
                  aiDrawerOpen ? "-right-4" : "pointer-events-none -right-4",
                )}
              />
            </div>
            <AIDrawerOverlay widthPx={effectiveAiDrawerWidthPx} assistantState={assistantState} />
          </div>
        </SidebarProvider>
      )}
    </ArclayerAssistantScope>
  );
}
