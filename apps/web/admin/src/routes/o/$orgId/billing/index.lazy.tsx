import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationBillingPage } from "@/pages/organization/billing/page";

export const Route = createLazyFileRoute("/o/$orgId/billing/")({
  component: OrganizationBillingPage,
});
