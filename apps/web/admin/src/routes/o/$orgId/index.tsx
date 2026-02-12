import { createFileRoute } from "@tanstack/react-router";

import { OrganizationOverviewPage } from "@/pages/organization/overview/page";

export const Route = createFileRoute("/o/$orgId/")({
  component: OrganizationScopedOverviewRoute,
});

function OrganizationScopedOverviewRoute() {
  const params = Route.useParams();
  return <OrganizationOverviewPage organizationId={params.orgId} />;
}
