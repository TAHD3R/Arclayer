import { useParams } from "@tanstack/react-router";

import { OrganizationSettingsBasicsView } from "../basics/components/organization-settings-basics-view";

export function OrganizationSettingsIndexPage() {
  const { orgId } = useParams({ from: "/o/$orgId/settings/" });
  return <OrganizationSettingsBasicsView organizationId={orgId} />;
}
