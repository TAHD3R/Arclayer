import { Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { type CSSProperties, type PropsWithChildren, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ADMIN_NAV_ITEMS } from "@/core/navigation/adminNav";
import { AdminSiderNav } from "@/components/app/AdminSiderNav";
import { AdminLogo } from "@/components/app/AdminLogo";
import { AdminAccountMenu } from "@/components/app/AdminAccountMenu";
import { AdminHeader } from "@/components/app/AdminHeader";
import { RouteProgress } from "@/core/ui/RouteProgress";
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
        </SidebarHeader>

        <SidebarContent className="pl-0 pr-4 py-8">
          <AdminSiderNav items={ADMIN_NAV_ITEMS} />
        </SidebarContent>

        <SidebarFooter className="p-0">
          <div className="w-full bg-sidebar">
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
        <div className="flex-1 min-h-0 overflow-auto">{children ?? <Outlet />}</div>
      </SidebarInset>

      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </SidebarProvider>
  );
}
