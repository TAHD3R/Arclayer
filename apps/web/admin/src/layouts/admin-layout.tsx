import { Outlet } from "@tanstack/react-router";
import { type CSSProperties, type PropsWithChildren, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  File,
  FileText,
  Gauge,
  HardDrive,
  History,
  Images,
  LibraryBig,
  Navigation2,
  Package,
  Paintbrush,
  Palette,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";

import { ADMIN_NAV_ITEMS } from "@/constants/admin-nav";
import type { AdminNavItem } from "@/constants/admin-nav";
import { ORG_NAV_ITEMS } from "@/constants/org-nav";
import { getAppConfig } from "@/constants/app-config";
import { AdminSiderNav } from "@/components/common/admin-side-nav";
import { AdminLogo } from "@/components/common/admin-logo";
import { AdminAccountMenu } from "@/components/common/admin-account-menu";
import { AdminWorkspaceSwitcher } from "@/components/common/admin-workspace-switcher";
import { AdminHeader } from "@/components/common/admin-header";
import { AdminNotificationCenter } from "@/components/common/admin-notification-center";
import { RouteProgress } from "@/components/common/route-progress";
import { RouteTransition } from "@/components/common/route-transition";
import { PageState } from "@/components/common/page-state";
import { useAuthStore } from "@/stores/use-auth-store";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { NotificationPreview } from "@/api/notifications";
import { getUnreadNotificationPreview, markNotificationRead } from "@/api/notifications";
import type { AdminMenuNodeEffective } from "@/api/admin-menus";
import { getAdminMenuCatalogEffective } from "@/api/admin-menus";
import { getWorkspaceDetail } from "@/api/workspaces";
import { useWorkspaceLocalization } from "@/hooks/use-workspace-localization";
import { useNowTick } from "@/hooks/use-now-tick";
import { formatRelativeTimeAt } from "@/lib/time/relative-time";
import { resolvePermissionNameI18nKey } from "@/lib/rbac-permissions";
import { ForbiddenView } from "@/pages/builtin/forbidden-page";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuSkeleton,
  SidebarProvider,
} from "@/components/ui/sidebar";

const ICON_MAP: Record<string, LucideIcon> = {
  Gauge,
  FileText,
  File,
  LibraryBig,
  Images,
  Palette,
  Paintbrush,
  Navigation2,
  Package,
  Users,
  UserPlus,
  ShieldCheck,
  Settings,
  SlidersHorizontal,
  Search,
  Wrench,
  HardDrive,
  History,
  Activity,
} as const;

function resolveLucideIcon(name?: string | null): LucideIcon {
  const key = String(name || "").trim();
  return ICON_MAP[key] ?? Package;
}

function buildNavItemsFromMenuNodes(nodes: AdminMenuNodeEffective[]): AdminNavItem[] {
  const walk = (n: AdminMenuNodeEffective): AdminNavItem => {
    const children = (n.children ?? []).map(walk);
    return {
      key: n.code,
      label: n.title,
      ...(n.titleI18n ? { labelKey: n.titleI18n } : {}),
      ...(n.path ? { to: n.path } : {}),
      icon: resolveLucideIcon(n.icon),
      disabled: !n.allowed,
      blockedReason: n.blockedReason ?? null,
      requiredPermission: n.requiredPermission ?? null,
      ownerPluginId: n.ownerPluginId ?? null,
      ...(children.length ? { children } : {}),
    };
  };

  return (nodes ?? []).map(walk);
}

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

function findActiveTrailNodes(items: AdminNavItem[], pathname: string): AdminNavItem[] {
  let bestScore = -1;
  let bestTrail: AdminNavItem[] = [];

  const dfs = (nodes: AdminNavItem[], parents: AdminNavItem[]) => {
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

  dfs(items, []);
  return bestTrail;
}

function collectAllowedWorkspacePathPrefixes(
  items: AdminNavItem[],
  workspaceBase: string,
): string[] {
  const base = normalizePath(workspaceBase);
  const prefixes = new Set<string>();

  prefixes.add(base);
  prefixes.add(normalizePath(`${base}/notifications`));
  // This route immediately redirects to the canonical org-scope path, but guard it as allowed
  // so the redirect can happen without being blocked.
  prefixes.add(normalizePath(`${base}/settings/organization`));

  const walk = (nodes: AdminNavItem[]) => {
    for (const n of nodes) {
      // Route guard must not treat disabled items as allowed.
      if (n.to && !n.disabled) prefixes.add(normalizePath(n.to));
      if (n.children?.length) walk(n.children);
    }
  };
  walk(items);

  // Alias routes that are implemented as "index" pages but not necessarily present in seeds.
  // Only enable them when the corresponding module is visible in the menu.
  const hasTeam = Array.from(prefixes).some((p) => p.startsWith(normalizePath(`${base}/team/`)));
  if (hasTeam) prefixes.add(normalizePath(`${base}/team`));
  const hasPlugins = Array.from(prefixes).some((p) =>
    p.startsWith(normalizePath(`${base}/plugins/`)),
  );
  if (hasPlugins) prefixes.add(normalizePath(`${base}/plugins`));

  return Array.from(prefixes);
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
  const effectiveLocale = usePreferencesStore((s) => s.locale);
  const localePreference = usePreferencesStore((s) => s.localePreference);
  const setEffectiveLocale = usePreferencesStore((s) => s.setEffectiveLocale);
  const cacheWorkspaceLocale = usePreferencesStore((s) => s.cacheWorkspaceLocale);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const orgPathPrefix = useMemo(() => {
    const matched = /^\/o\/[^/]+/.exec(pathname || "");
    return matched?.[0] ?? null;
  }, [pathname]);

  const isOrgScopeRoute = useMemo(() => {
    const p = pathname || "/";
    return p === "/" || p.startsWith("/o/");
  }, [pathname]);

  const workspaceBase = useMemo(() => {
    if (!workspaceId) return null;
    const id = String(workspaceId).trim();
    if (!id) return null;
    return `/w/${id}`;
  }, [workspaceId]);

  const workspaceMenuQuery = useQuery({
    queryKey: ["workspace", "adminMenu", workspaceId, effectiveLocale],
    enabled: Boolean(accessToken && workspaceId && !isOrgScopeRoute),
    queryFn: async () => getAdminMenuCatalogEffective(String(workspaceId)),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const resolvePermissionName = useMemo(() => {
    return (code: string) => {
      const i18nKey = resolvePermissionNameI18nKey(code);
      if (!i18nKey) return null;
      // i18next returns the key itself when missing; treat that as "unmapped".
      const text = t(i18nKey);
      if (!text || text === i18nKey) return null;
      return text;
    };
  }, [t]);

  const isWorkspaceScopeRoute = useMemo(() => {
    if (!workspaceBase) return false;
    return normalizePath(pathname).startsWith(normalizePath(workspaceBase));
  }, [pathname, workspaceBase]);

  const menuBootstrapping = Boolean(
    accessToken &&
    workspaceId &&
    !isOrgScopeRoute &&
    isWorkspaceScopeRoute &&
    workspaceMenuQuery.isLoading,
  );

  const navItems = useMemo(() => {
    if (isOrgScopeRoute) {
      if (!orgPathPrefix) return ORG_NAV_ITEMS;

      const mapOrgItems = (items: AdminNavItem[]): AdminNavItem[] => {
        return items.map((item) => {
          let to = item.to;
          if (item.to) {
            const subPath = item.to === "/" ? "" : item.to;
            to = `${orgPathPrefix}${subPath.startsWith("/") ? subPath : `/${subPath}`}`;
          }
          return {
            ...item,
            ...(to ? { to } : {}),
            ...(item.children?.length ? { children: mapOrgItems(item.children) } : {}),
          };
        });
      };

      return mapOrgItems(ORG_NAV_ITEMS);
    }
    // When workspace is not selected (or currentWorkspaceId is temporarily unavailable),
    // keep a stable shell so error/not-found pages don't "drop" the layout.
    if (!workspaceBase) return ORG_NAV_ITEMS;
    const base = workspaceBase.endsWith("/") ? workspaceBase.slice(0, -1) : workspaceBase;

    const baseItems: AdminNavItem[] = workspaceMenuQuery.data?.items?.length
      ? buildNavItemsFromMenuNodes(workspaceMenuQuery.data.items)
      : workspaceMenuQuery.isError
        ? ADMIN_NAV_ITEMS
        : [];

    const mapItems = (items: AdminNavItem[]): AdminNavItem[] => {
      return items.map((it) => {
        const to = it.to
          ? it.to === "/"
            ? `${base}/`
            : `${base}${it.to.startsWith("/") ? it.to : `/${it.to}`}`
          : undefined;
        return {
          ...it,
          ...(to ? { to } : {}),
          ...(it.children?.length ? { children: mapItems(it.children) } : {}),
        };
      });
    };

    return mapItems(baseItems);
  }, [isOrgScopeRoute, workspaceBase, workspaceMenuQuery.data?.items, workspaceMenuQuery.isError]);

  const workspaceRouteGuard = useMemo(() => {
    if (isOrgScopeRoute) return { kind: "skip" as const };
    if (!workspaceBase || !isWorkspaceScopeRoute) return { kind: "skip" as const };
    if (workspaceMenuQuery.isLoading && !workspaceMenuQuery.data)
      return { kind: "loading" as const };
    if (workspaceMenuQuery.isError)
      return { kind: "error" as const, error: workspaceMenuQuery.error };

    const allowedPrefixes = collectAllowedWorkspacePathPrefixes(navItems, workspaceBase);
    const ok = allowedPrefixes.some((p) => isPrefixMatch(p, pathname));
    return ok ? { kind: "ok" as const } : { kind: "forbidden" as const };
  }, [
    isOrgScopeRoute,
    isWorkspaceScopeRoute,
    navItems,
    pathname,
    workspaceBase,
    workspaceMenuQuery.data,
    workspaceMenuQuery.error,
    workspaceMenuQuery.isError,
    workspaceMenuQuery.isLoading,
  ]);

  const [refreshing, setRefreshing] = useState(false);

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", workspaceId],
    enabled: Boolean(accessToken && workspaceId && !isOrgScopeRoute),
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
    const next = workspaceLocalization.localization.locale;
    if (!next) return;
    // Always cache workspace default locale for smoother refresh bootstrapping.
    cacheWorkspaceLocale(String(workspaceId), next);
    if (localePreference) return;
    setEffectiveLocale(next);
  }, [
    accessToken,
    cacheWorkspaceLocale,
    localePreference,
    setEffectiveLocale,
    workspaceId,
    workspaceLocalization.localization.locale,
  ]);

  const routeTitle = useMemo(() => {
    const trail = findActiveTrailNodes(navItems, pathname);
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
    enabled: Boolean(accessToken && workspaceId && !isOrgScopeRoute),
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

  return (
    <SidebarProvider defaultOpen className="h-screen">
      <RouteProgress />

      <Sidebar
        collapsible="none"
        animateOnHover={false}
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
            {isOrgScopeRoute ? brandTitle : workspaceName || brandTitle}
          </h2>
        </SidebarHeader>

        <SidebarContent className="relative z-0 pl-0 pr-4 scrollbar-none">
          {isOrgScopeRoute ? (
            <AdminSiderNav items={navItems} resolvePermissionName={resolvePermissionName} />
          ) : menuBootstrapping ? (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1.5">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <SidebarMenuSkeleton key={i} showIcon />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <AdminSiderNav items={navItems} resolvePermissionName={resolvePermissionName} />
          )}
        </SidebarContent>

        <SidebarFooter className="relative z-10 isolate p-0">
          <div className="w-full bg-sidebar">
            <div className="px-4 pb-3">
              {showSidebarNotificationCenter && !isOrgScopeRoute && workspaceBase ? (
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
            <div className="w-full">
              <AdminWorkspaceSwitcher />
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="w-auto flex-1 min-w-0 overflow-hidden">
        <AdminHeader
          navItems={navItems}
          accountMenuSlot={
            <div className="max-w-[45vw]">
              <AdminAccountMenu triggerVariant="header" />
            </div>
          }
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
          <PageState
            loading={workspaceRouteGuard.kind === "loading"}
            error={workspaceRouteGuard.kind === "error" ? workspaceRouteGuard.error : null}
            onRetry={
              workspaceRouteGuard.kind === "error"
                ? () => {
                    void workspaceMenuQuery.refetch();
                  }
                : undefined
            }
            loadingVariant="form"
          >
            {workspaceRouteGuard.kind === "forbidden" ? (
              <ForbiddenView variant="admin" />
            ) : (
              <RouteTransition className="w-full">{children ?? <Outlet />}</RouteTransition>
            )}
          </PageState>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
