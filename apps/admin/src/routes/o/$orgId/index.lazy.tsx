import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationOverviewPage } from "@/pages/organization/overview/page";

export const Route = createLazyFileRoute("/o/$orgId/")({
  component: OrganizationOverviewPage,
});
