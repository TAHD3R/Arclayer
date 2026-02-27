import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationMembersPage } from "@/pages/organization/members/page";

export const Route = createLazyFileRoute("/o/$orgId/members/")({
  component: OrganizationMembersPage,
});
