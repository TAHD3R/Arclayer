import { createFileRoute } from "@tanstack/react-router";

import { TenantGovernancePage } from "@/pages/tenant-governance";

export const Route = createFileRoute("/_authenticated/tenants")({
  component: TenantGovernancePage,
});
