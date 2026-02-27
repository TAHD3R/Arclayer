import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/settings/general/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceId/settings/general/site",
      params: { workspaceId: params.workspaceId },
      replace: true,
    });
  },
});
