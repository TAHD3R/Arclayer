import { useParams } from "@tanstack/react-router";

import { OrganizationSettingsDangerView } from "./components/organization-settings-danger-view";

export function OrganizationSettingsDangerPage() {
  const { orgId } = useParams({ from: "/o/$orgId/settings/danger/" });
  return <OrganizationSettingsDangerView organizationId={orgId} />;
}
