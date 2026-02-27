import { createFileRoute } from "@tanstack/react-router";

type OrganizationWorkspacesSearch = {
  create?: "1";
};

export const Route = createFileRoute("/o/$orgId/workspaces/")({
  validateSearch: (search: Record<string, unknown>): OrganizationWorkspacesSearch => {
    const create = search.create;
    return create === "1" ? { create: "1" } : {};
  },
});
