import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/content/create/")({
  staticData: { titleKey: "nav:NAV_CONTENT_LIBRARY" },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/content/library",
      params: { projectId: params.projectId },
      search: { create: "1" },
      replace: true,
    });
  },
});
