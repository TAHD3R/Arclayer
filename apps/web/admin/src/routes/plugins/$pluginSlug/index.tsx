import { createFileRoute } from "@tanstack/react-router";

import { OrganizationPluginDetailView } from "@/pages/plugins/organization-plugin-detail/page";

export const Route = createFileRoute("/plugins/$pluginSlug/")({
  component: PluginSlugPage,
});

function PluginSlugPage() {
  const { pluginSlug } = Route.useParams();
  return <OrganizationPluginDetailView pluginSlug={pluginSlug} />;
}
