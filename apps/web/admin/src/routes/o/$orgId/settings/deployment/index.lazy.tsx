import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationSettingsDeploymentPage } from "@/pages/organization/settings/deployment/page";

export const Route = createLazyFileRoute("/o/$orgId/settings/deployment/")({
  component: OrganizationSettingsDeploymentPage,
});
