import { createFileRoute } from "@tanstack/react-router";

import { OrganizationSettingsView } from "@/pages/organization/settings/page";

export const Route = createFileRoute("/o/$orgId/settings/")({
  component: OrganizationSettingsRoutePage,
});

function OrganizationSettingsRoutePage() {
  return <OrganizationSettingsView />;
}
