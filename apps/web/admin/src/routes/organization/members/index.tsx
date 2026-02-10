import { createFileRoute } from "@tanstack/react-router";

import { OrganizationMembersPage } from "@/pages/organization/members/page";

export const Route = createFileRoute("/organization/members/")({
  component: OrganizationMembersPage,
});
