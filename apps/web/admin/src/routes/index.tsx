import { createFileRoute } from "@tanstack/react-router";

import { OrganizationOverviewPage } from "@/pages/organization/overview/page";

export const Route = createFileRoute("/")({
  component: OrganizationOverviewPage,
});
