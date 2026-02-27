import { useParams } from "@tanstack/react-router";

import { OrganizationSettingsBasicsView } from "./components/organization-settings-basics-view";

export function OrganizationSettingsBasicsPage() {
  const { orgId } = useParams({ from: "/o/$orgId/settings/basics/" });
  return <OrganizationSettingsBasicsView organizationId={orgId} />;
}
