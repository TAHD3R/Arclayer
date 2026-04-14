import { Outlet, createFileRoute } from "@tanstack/react-router";

import { SystemSettingsShell } from "@/pages/system/system-settings-shell";

export const Route = createFileRoute("/system")({
  component: SystemRouteLayout,
});

function SystemRouteLayout() {
  return (
    <SystemSettingsShell>
      <Outlet />
    </SystemSettingsShell>
  );
}
