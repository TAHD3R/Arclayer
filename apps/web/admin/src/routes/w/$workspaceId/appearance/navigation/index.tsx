import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/appearance/navigation/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceId/content/pages",
      params: { workspaceId: params.workspaceId },
    });
  },
});
