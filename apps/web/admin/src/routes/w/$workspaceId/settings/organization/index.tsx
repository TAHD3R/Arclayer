import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/settings/organization/")({
  beforeLoad: () => {
    // Organization governance has a canonical scope without `/w/:workspaceId`.
    throw redirect({ to: "/settings/organization" });
  },
});
