import { createFileRoute } from "@tanstack/react-router";

import { OrganizationSettingsView } from "@/views/settings/organization/OrganizationSettingsView";

export const Route = createFileRoute("/w/$workspaceId/settings/organization/")({
  component: OrganizationSettingsRoutePage,
});

function OrganizationSettingsRoutePage() {
  return <OrganizationSettingsView />;
}
