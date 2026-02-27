import { createLazyFileRoute } from "@tanstack/react-router";

import { OrganizationExtensionsPage } from "@/pages/organization/extensions/page";

export const Route = createLazyFileRoute("/o/$orgId/extensions/")({
  component: OrganizationExtensionsPage,
});
