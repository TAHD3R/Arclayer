import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/settings/site/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_SITE" },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceId/settings/site/basics",
      params: { workspaceId: params.workspaceId },
      replace: true,
    });
  },
});
