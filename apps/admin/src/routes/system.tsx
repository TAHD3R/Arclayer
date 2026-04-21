import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";

import { SystemDirectoryShell } from "@/pages/system/directory/system-directory-shell";
import { SystemSettingsShell } from "@/pages/system/system-settings-shell";

export const Route = createFileRoute("/system")({
  component: SystemRouteLayout,
});

function SystemRouteLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const Shell = pathname.startsWith("/system/tenants") ? SystemDirectoryShell : SystemSettingsShell;

  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}
