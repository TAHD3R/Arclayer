import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationSettingsIndexPage } from "@/pages/organization/settings/index/page";

export const Route = createLazyFileRoute("/o/$orgId/settings/")({
  component: OrganizationSettingsIndexPage,
});
