import { createFileRoute } from "@tanstack/react-router";

import { OrganizationPluginDetailView } from "@/pages/plugins/organization-plugin-detail/page";

export const Route = createFileRoute("/o/$orgId/plugins/$pluginSlug/")({
  component: PluginSlugPage,
});

function PluginSlugPage() {
  const { orgId, pluginSlug } = Route.useParams();
  return <OrganizationPluginDetailView organizationId={orgId} pluginSlug={pluginSlug} />;
}
