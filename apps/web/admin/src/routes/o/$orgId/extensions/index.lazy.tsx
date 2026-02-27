import { createLazyFileRoute } from "@tanstack/react-router";

import { ExtensionsPage } from "@/pages/extensions/extensions-page";

export const Route = createLazyFileRoute("/o/$orgId/extensions/")({
  component: OrganizationExtensionsRoute,
});

function OrganizationExtensionsRoute() {
  const { orgId } = Route.useParams();
  return <ExtensionsPage scope="organization" organizationId={orgId} />;
}
