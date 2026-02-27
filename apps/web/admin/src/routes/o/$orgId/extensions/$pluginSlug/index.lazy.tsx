import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationExtensionDetailPage } from "@/pages/extensions/organization-extension-detail/page";

export const Route = createLazyFileRoute("/o/$orgId/extensions/$pluginSlug/")({
  component: OrganizationExtensionDetailPage,
});
