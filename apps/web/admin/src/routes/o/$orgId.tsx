import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$orgId")({
  component: OrganizationScopedLayout,
});

function OrganizationScopedLayout() {
  return <Outlet />;
}
