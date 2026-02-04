import { Outlet } from "@tanstack/react-router";
import { type CSSProperties, type PropsWithChildren, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ADMIN_NAV_ITEMS } from "@/constants/admin-nav";
import { getAppConfig } from "@/constants/app-config";
import { AdminSiderNav } from "@/components/common/admin-side-nav";
import { AdminLogo } from "@/components/common/admin-logo";
import { AdminAccountMenu } from "@/components/common/admin-account-menu";
import { AdminHeader } from "@/components/common/admin-header";
import { AdminNotificationCenter } from "@/components/common/admin-notification-center";
import { RouteProgress } from "@/components/common/route-progress";
import { RouteTransition } from "@/components/common/route-transition";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { NotificationPreview } from "@/api/notifications";
import { getUnreadNotificationPreview, markNotificationRead } from "@/api/notifications";
import { getWorkspaceDetail } from "@/api/workspaces";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { useNowTick } from "@/hooks/use-now-tick";
import { formatRelativeTimeAt } from "@/lib/time/relative-time";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

function normalizePath(input: string): string {
  if (input.length > 1 && input.endsWith("/")) return input.slice(0, -1);
  return input;
}

function isExactMatch(to: string, pathname: string): boolean {
  const t = normalizePath(to);
  const p = normalizePath(pathname);
  return p === t;
}

function isPrefixMatch(to: string, pathname: string): boolean {
  const t = normalizePath(to);
  const p = normalizePath(pathname);
  if (t === "/") return p === "/";
  return p === t || p.startsWith(`${t}/`);
}

function findActiveTrailNodes(
  items: typeof ADMIN_NAV_ITEMS,
  pathname: string,
): (typeof ADMIN_NAV_ITEMS)[number][] {
  let bestScore = -1;
  let bestTrail: (typeof ADMIN_NAV_ITEMS)[number][] = [];

  const dfs = (nodes: any[], parents: any[]) => {
    for (const node of nodes) {
      const nextParents = [...parents, node];

      if (node.to) {
        const isExact = isExactMatch(node.to, pathname);
        const isPrefix = isPrefixMatch(node.to, pathname);
        const score = isExact ? 1000 + node.to.length : isPrefix ? 100 + node.to.length : 0;
        if (score > 0 && score > bestScore) {
          bestScore = score;
          bestTrail = nextParents;
        }
      }

      if (node.children?.length) dfs(node.children, nextParents);
    }
  };

  dfs(items as any[], []);
  return bestTrail;
}

function buildDocumentTitle(routeTitle: string | null, workspaceName: string | null): string {
  const brand = (getAppConfig().title || "Celestial").trim();
  if (!workspaceName || !workspaceName.trim()) {
    return routeTitle && routeTitle.trim() ? `${routeTitle.trim()} | ${brand}` : brand;
  }

  const base = workspaceName.trim();
  const part = base.toLowerCase().includes(brand.toLowerCase()) ? base : `${base} ${brand}`;
  if (routeTitle && routeTitle.trim()) return `${routeTitle.trim()} | ${part}`;
  return part;
}

export function AdminLayout({ children }: PropsWithChildren) {
  const { t, i18n } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const showSidebarNotificationCenter = usePreferencesStore((s) => s.showSidebarNotificationCenter);
  const localePreference = usePreferencesStore((s) => s.localePreference);
  const setEffectiveLocale = usePreferencesStore((s) => s.setEffectiveLocale);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const workspaceBase = useMemo(() => {
    if (!workspaceId) return null;
    const id = String(workspaceId).trim();
    if (!id) return null;
    return `/w/${id}`;
  }, [workspaceId]);

  const navItems = useMemo(() => {
    if (!workspaceBase) return [];
    const base = workspaceBase.endsWith("/") ? workspaceBase.slice(0, -1) : workspaceBase;

    const mapItems = (items: typeof ADMIN_NAV_ITEMS): typeof ADMIN_NAV_ITEMS => {
      return items.map((it) => {
        const to = it.to
          ? it.to === "/"
            ? `${base}/`
            : `${base}${it.to.startsWith("/") ? it.to : `/${it.to}`}`
          : undefined;
        return {
          ...it,
          ...(to ? { to } : {}),
          ...(it.children?.length ? { children: mapItems(it.children as any) } : {}),
        } as any;
      });
    };

    return mapItems(ADMIN_NAV_ITEMS);
  }, [workspaceBase]);

  const [refreshing, setRefreshing] = useState(false);

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", workspaceId],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: async () => getWorkspaceDetail(String(workspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const workspaceName = useMemo(() => {
    const raw = workspaceDetailQuery.data?.name;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  }, [workspaceDetailQuery.data?.name]);

  const workspaceLocalization = useWorkspaceLocalization();

  useEffect(() => {
    // When user has no explicit preference, apply workspace default locale as the effective UI locale.
    // This keeps behavior consistent across sessions without persisting it as a personal choice.
    if (!accessToken || !workspaceId) return;
    if (localePreference) return;
    const next = workspaceLocalization.localization.locale;
    if (!next) return;
    setEffectiveLocale(next);
  }, [
    accessToken,
    localePreference,
    setEffectiveLocale,
    workspaceId,
    workspaceLocalization.localization.locale,
  ]);

  const routeTitle = useMemo(() => {
    const trail = findActiveTrailNodes(navItems as any, pathname);
    const current = trail[trail.length - 1];
    if (!current) return null;
    return current.labelKey ? t(current.labelKey) : current.label;
  }, [navItems, pathname, t]);

  useEffect(() => {
    document.title = buildDocumentTitle(routeTitle, workspaceName);
  }, [routeTitle, workspaceName]);

  const brandTitle = useMemo(() => (getAppConfig().title || "Celestial").trim(), []);

  const notificationsPreviewQuery = useQuery({
    queryKey: ["notifications", "preview", workspaceId],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: async () => getUnreadNotificationPreview(String(workspaceId), { limit: 3 }),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    meta: { silent: true },
  });
  const nowMs = useNowTick(60_000);

  const markPreviewItemReadOptimistic = (id: string) => {
    queryClient.setQueryData<NotificationPreview>(
      ["notifications", "preview", workspaceId],
      (old) => {
        if (!old) return old;
        return {
          ...old,
          unreadCount: Math.max(0, old.unreadCount - 1),
          items: old.items.filter((x) => x.id !== id),
        };
      },
    );
  };

  // When workspace is not selected (e.g. landing at "/"), render a minimal shell.
  // The "/" route is responsible for picking a workspace and redirecting.
  if (!workspaceBase) {
    return <>{children ?? <Outlet />}</>;
  }

  return (
    <SidebarProvider defaultOpen className="h-screen">
      <RouteProgress />

      <Sidebar
        collapsible="none"
        className="shrink-0 h-full border-r"
        style={
          {
            width: 240,
            minWidth: 240,
            "--ant-color-link": "var(--color-muted-foreground)",
          } as CSSProperties
        }
      >
        <SidebarHeader className="flex flex-col items-center gap-4 w-full px-0 py-8">
          <AdminLogo ariaLabel="Celestial" />
          <h2 className="font-bold line-clamp-2 text-center select-none max-w-2/3 wrap-break-word">
            {workspaceName || brandTitle}
          </h2>
        </SidebarHeader>

        <SidebarContent className="relative z-0 pl-0 pr-4 scrollbar-none">
          <AdminSiderNav items={navItems as any} />
        </SidebarContent>

        <SidebarFooter className="relative z-10 isolate p-0">
          <div className="w-full bg-sidebar">
            <div className="px-4 pb-3">
              {showSidebarNotificationCenter ? (
                <AdminNotificationCenter
                  maxItems={2}
                  unreadCount={notificationsPreviewQuery.data?.unreadCount ?? 0}
                  items={(notificationsPreviewQuery.data?.items ?? []).map((n) => ({
                    id: n.id,
                    title: n.title,
                    subtitle: n.body ?? undefined,
                    time: formatRelativeTimeAt(n.createdAt, i18n.language, nowMs),
                    to: n.targetTo ? `${workspaceBase}${n.targetTo}` : undefined,
                  }))}
                  onViewAll={() => {
                    void navigate({ to: `${workspaceBase}/notifications` });
                  }}
                  onItemClick={(item) => {
                    const to = item.to;
                    const id = String(item.id);
                    markPreviewItemReadOptimistic(id);
                    void markNotificationRead(String(workspaceId), id).finally(() => {
                      // Best-effort refresh to keep badge/list in sync (handles failures/edge cases).
                      void queryClient.invalidateQueries({
                        queryKey: ["notifications", "preview", workspaceId],
                      });
                    });
                    if (to) void navigate({ to: to as never });
                  }}
                  onDismiss={(id) => {
                    const notificationId = String(id);
                    markPreviewItemReadOptimistic(notificationId);
                    void markNotificationRead(String(workspaceId), notificationId).finally(() => {
                      void queryClient.invalidateQueries({
                        queryKey: ["notifications", "preview", workspaceId],
                      });
                    });
                  }}
                />
              ) : null}
            </div>
            <AdminAccountMenu />
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="w-auto flex-1 min-w-0 overflow-hidden">
        <AdminHeader
          navItems={navItems as any}
          refreshing={refreshing}
          onRefresh={async () => {
            if (refreshing) return;
            setRefreshing(true);
            try {
              // Only refetch currently mounted queries so we "refresh the page content" without a full reload.
              await queryClient.refetchQueries({ type: "active" });
            } finally {
              setRefreshing(false);
            }
          }}
        />
        <div className="flex-1 min-h-0 overflow-auto">
          <RouteTransition className="w-full">{children ?? <Outlet />}</RouteTransition>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
