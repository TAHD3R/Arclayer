import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationSettingsBasicsPage } from "@/pages/organization/settings/basics/page";

export const Route = createLazyFileRoute("/o/$orgId/settings/basics/")({
  component: OrganizationSettingsBasicsPage,
});
