import { createFileRoute } from "@tanstack/react-router";

import { OrganizationActivityPage } from "@/pages/organization/activity/page";

export const Route = createFileRoute("/o/$orgId/settings/activity/")({
  component: () => <OrganizationActivityPage />,
});
