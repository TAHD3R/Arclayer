import { useParams } from "@tanstack/react-router";

import { OrganizationSettingsDeploymentView } from "./components/organization-settings-deployment-view";

export function OrganizationSettingsDeploymentPage() {
  const { orgId } = useParams({ from: "/o/$orgId/settings/deployment/" });
  return <OrganizationSettingsDeploymentView organizationId={orgId} />;
}
