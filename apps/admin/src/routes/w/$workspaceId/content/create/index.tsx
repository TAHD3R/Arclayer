import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/content/create/")({
  staticData: { titleKey: "nav:NAV_CONTENT_LIBRARY" },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceId/content/library",
      params: { workspaceId: params.workspaceId },
      search: { create: "1" },
      replace: true,
    });
  },
});
