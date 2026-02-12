import { createFileRoute } from "@tanstack/react-router";

import { OrganizationActivityPage } from "@/pages/settings/organization/activity/page";

export const Route = createFileRoute("/o/$orgId/settings/organization/activity/")({
  component: () => <OrganizationActivityPage />,
});
