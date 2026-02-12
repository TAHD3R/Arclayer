import { createFileRoute } from "@tanstack/react-router";

import { OrganizationWorkspacesPage } from "@/pages/organization/workspaces/page";

type OrganizationWorkspacesSearch = {
  create?: "1";
};

export const Route = createFileRoute("/o/$orgId/workspaces/")({
  validateSearch: (search: Record<string, unknown>): OrganizationWorkspacesSearch => {
    const create = search.create;
    return create === "1" ? { create: "1" } : {};
  },
  component: OrganizationScopedWorkspacesRoute,
});

function OrganizationScopedWorkspacesRoute() {
  const search = Route.useSearch();
  const params = Route.useParams();

  return (
    <OrganizationWorkspacesPage
      organizationId={params.orgId}
      autoOpenCreate={search.create === "1"}
    />
  );
}
