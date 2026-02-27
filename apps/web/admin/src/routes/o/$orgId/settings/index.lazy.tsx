import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationSettingsPage } from "@/pages/organization/settings/page";

export const Route = createLazyFileRoute("/o/$orgId/settings/")({
  component: OrganizationSettingsPage,
});
