import { createFileRoute } from "@tanstack/react-router";

import { OrganizationActivityPage } from "@/pages/settings/organization/activity/page";

export const Route = createFileRoute("/organization/activity/")({
  component: OrganizationActivityPage,
});
