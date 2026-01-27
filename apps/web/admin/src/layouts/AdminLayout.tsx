import { Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { type CSSProperties, type PropsWithChildren } from "react";

import { ADMIN_NAV_ITEMS } from "@/core/navigation/adminNav";
import { AdminSiderNav } from "@/components/app/AdminSiderNav";
import { AdminLogo } from "@/components/app/AdminLogo";
import { AdminAccountMenu } from "@/components/app/AdminAccountMenu";
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

        <SidebarContent className="pl-0 pr-4 pt-4 pb-8">
          <AdminSiderNav items={ADMIN_NAV_ITEMS} />
        </SidebarContent>

        <SidebarFooter className="p-0">
          <div className="w-full bg-sidebar">
            <AdminAccountMenu />
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="w-auto flex-1 min-w-0 overflow-auto">
        {children ?? <Outlet />}
      </SidebarInset>

      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-right" /> : null}
    </SidebarProvider>
  );
}
