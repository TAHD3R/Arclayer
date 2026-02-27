import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationActivityPage } from "@/pages/organization/activity/page";

export const Route = createLazyFileRoute("/o/$orgId/settings/activity/")({
  component: OrganizationActivityPage,
});
