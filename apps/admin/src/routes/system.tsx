import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";

import { SystemDirectoryShell } from "@/pages/system/directory/system-directory-shell";
import { SystemSettingsLayout } from "@/pages/system/components/system-settings-layout";

export const Route = createFileRoute("/system")({
  component: SystemRouteLayout,
});

function SystemRouteLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const Shell = pathname.startsWith("/system/settings")
    ? SystemSettingsLayout
    : pathname.startsWith("/system/tenants")
      ? SystemDirectoryShell
      : undefined;

  return Shell ? (
    <Shell>
      <Outlet />
    </Shell>
  ) : (
    <Outlet />
  );
}
