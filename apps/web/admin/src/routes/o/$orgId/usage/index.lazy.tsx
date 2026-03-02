import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationUsagePage } from "@/pages/organization/usage/page";

export const Route = createLazyFileRoute("/o/$orgId/usage/")({
  component: OrganizationUsagePage,
});
