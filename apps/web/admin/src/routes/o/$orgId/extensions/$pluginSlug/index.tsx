import { createFileRoute } from "@tanstack/react-router";

import { OrganizationExtensionDetailView } from "@/pages/extensions/organization-extension-detail/page";

export const Route = createFileRoute("/o/$orgId/extensions/$pluginSlug/")({
  component: ExtensionSlugPage,
});

function ExtensionSlugPage() {
  const { orgId, pluginSlug } = Route.useParams();
  return <OrganizationExtensionDetailView organizationId={orgId} pluginSlug={pluginSlug} />;
}
