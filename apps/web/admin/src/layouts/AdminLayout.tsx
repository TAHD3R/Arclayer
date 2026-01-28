import { Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { type CSSProperties, type PropsWithChildren, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ADMIN_NAV_ITEMS } from "@/constants/admin-nav";
import { getAppConfig } from "@/constants/app-config";
import { AdminSiderNav } from "@/components/app/adminSideNav";
import { AdminLogo } from "@/components/app/adminLogo";
import { AdminAccountMenu } from "@/components/app/adminAccountMenu";
import { AdminHeader } from "@/components/app/adminHeader";
import { AdminNotificationCenter } from "@/components/app/adminNotificationCenter";
import { RouteProgress } from "@/components/app/routeProgress";
import { RouteTransition } from "@/components/app/routeTransition";
import { useAuthStore } from "@/stores/useAuthStore";
import { getCoreSettings } from "@/api/settings";
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

function pickCoreSiteName(value: Record<string, unknown> | undefined): string | null {
  const site = (value?.site ?? null) as Record<string, unknown> | null;
  const raw = site?.name;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

function buildDocumentTitle(routeTitle: string | null, siteName: string | null): string {
  const brand = (getAppConfig().title || "Celestial").trim();
  if (!siteName || !siteName.trim()) {
    return routeTitle && routeTitle.trim() ? `${routeTitle.trim()} | ${brand}` : brand;
  }

  const siteBase = siteName.trim();
  const sitePart = siteBase.toLowerCase().includes(brand.toLowerCase())
    ? siteBase
    : `${siteBase} | ${brand}`;
  if (routeTitle && routeTitle.trim()) return `${routeTitle.trim()} | ${sitePart}`;
  return sitePart;
}

export function AdminLayout({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [refreshing, setRefreshing] = useState(false);

  const coreQuery = useQuery({
    queryKey: ["settings", "core"],
    enabled: Boolean(accessToken),
    queryFn: async () => getCoreSettings(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const siteName = useMemo(() => pickCoreSiteName(coreQuery.data?.value), [coreQuery.data?.value]);

  const routeTitle = useMemo(() => {
    const trail = findActiveTrailNodes(ADMIN_NAV_ITEMS, pathname);
    const current = trail[trail.length - 1];
    if (!current) return null;
    return current.labelKey ? t(current.labelKey) : current.label;
  }, [pathname, t]);

  useEffect(() => {
    document.title = buildDocumentTitle(routeTitle, siteName);
  }, [routeTitle, siteName]);

  const brandTitle = useMemo(() => (getAppConfig().title || "Celestial").trim(), []);

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
        <SidebarHeader className="flex flex-col items-center gap-4 w-full px-0 pt-16 pb-8">
          <AdminLogo ariaLabel="Celestial Admin" />
          <h2 className="font-bold line-clamp-2 text-center select-none max-w-2/3 wrap-break-word">
            {siteName || brandTitle}
          </h2>
        </SidebarHeader>

        <SidebarContent className="pl-0 pr-4 py-8">
          <AdminSiderNav items={ADMIN_NAV_ITEMS} />
        </SidebarContent>

        <SidebarFooter className="p-0">
          <div className="w-full bg-sidebar">
            <div className="px-4 pb-3">
              <AdminNotificationCenter maxItems={3} />
            </div>
            <AdminAccountMenu />
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="w-auto flex-1 min-w-0 overflow-hidden">
        <AdminHeader
          navItems={ADMIN_NAV_ITEMS}
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

      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </SidebarProvider>
  );
}
