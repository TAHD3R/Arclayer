import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationExtensionsPage } from "@/pages/organization/extensions/page";

export const Route = createLazyFileRoute("/o/$orgId/extensions/")({
  component: OrganizationExtensionsRoute,
});

function OrganizationExtensionsRoute() {
  const { orgId } = Route.useParams();
  return <OrganizationExtensionsPage organizationId={orgId} />;
}
