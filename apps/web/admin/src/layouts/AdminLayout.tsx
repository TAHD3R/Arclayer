import { Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { type CSSProperties, type PropsWithChildren, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ADMIN_NAV_ITEMS } from "@/constants/admin-nav";
import { AdminSiderNav } from "@/components/app/adminSideNav";
import { AdminLogo } from "@/components/app/adminLogo";
import { AdminAccountMenu } from "@/components/app/adminAccountMenu";
import { AdminHeader } from "@/components/app/adminHeader";
import { AdminNotificationCenter } from "@/components/app/adminNotificationCenter";
import { RouteProgress } from "@/components/app/routeProgress";
import { RouteTransition } from "@/components/app/routeTransition";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

export function AdminLayout({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();

  const [refreshing, setRefreshing] = useState(false);

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
            {/* TODO: Change with real organization name */}
            Celestial's Organization
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
