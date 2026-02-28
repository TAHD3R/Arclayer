import { Outlet, createFileRoute } from "@tanstack/react-router";

import { RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";

export const Route = createFileRoute("/o/$orgId")({
  staticData: { titleKey: "nav:NAV_ORG_OVERVIEW" },
  component: OrganizationScopedLayout,
  notFoundComponent: RouterDefaultNotFound,
});

function OrganizationScopedLayout() {
  return <Outlet />;
}
