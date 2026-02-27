import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationSettingsDangerPage } from "@/pages/organization/settings/danger/page";

export const Route = createLazyFileRoute("/o/$orgId/settings/danger/")({
  component: OrganizationSettingsDangerPage,
});
