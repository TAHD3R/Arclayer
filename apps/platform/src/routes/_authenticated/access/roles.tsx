import { createFileRoute } from "@tanstack/react-router";

import { PlatformRolesPage } from "@/pages/access-roles";

export const Route = createFileRoute("/_authenticated/access/roles")({
  component: PlatformRolesPage,
});
