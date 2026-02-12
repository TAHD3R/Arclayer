import { createFileRoute } from "@tanstack/react-router";

import { OrganizationMembersPage } from "@/pages/organization/members/page";

export const Route = createFileRoute("/o/$orgId/members/")({
  component: OrganizationMembersPage,
});
