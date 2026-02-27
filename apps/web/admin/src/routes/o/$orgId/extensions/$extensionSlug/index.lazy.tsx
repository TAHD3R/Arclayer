import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationExtensionDetailPage } from "@/pages/organization/extensions/detail/page";

export const Route = createLazyFileRoute("/o/$orgId/extensions/$extensionSlug/")({
  component: OrganizationExtensionDetailPage,
});
