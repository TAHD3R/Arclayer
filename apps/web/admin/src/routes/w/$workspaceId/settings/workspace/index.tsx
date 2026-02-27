import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/settings/workspace/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceId/settings/workspace/basics",
      params: { workspaceId: params.workspaceId },
      replace: true,
    });
  },
});
