import { createFileRoute } from "@tanstack/react-router";

import { PluginsInstalledView } from "@/pages/workspaces/plugins/installed/page";

export const Route = createFileRoute("/o/$orgId/plugins/installed/")({
  component: OrganizationPluginsInstalledRoute,
});

function OrganizationPluginsInstalledRoute() {
  const { orgId } = Route.useParams();
  return <PluginsInstalledView scope="organization" organizationId={orgId} />;
}
