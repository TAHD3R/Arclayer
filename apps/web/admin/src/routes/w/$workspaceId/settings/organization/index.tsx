import { createFileRoute } from "@tanstack/react-router";

import { OrganizationSettingsView } from "@/pages/settings/organization/page";

export const Route = createFileRoute("/w/$workspaceId/settings/organization/")({
  component: OrganizationSettingsRoutePage,
});

function OrganizationSettingsRoutePage() {
  return <OrganizationSettingsView />;
}
