import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/settings/workspace/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_WORKSPACE" },
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/w/$workspaceId/settings/workspace/basics",
      params: { workspaceId: params.workspaceId },
      replace: true,
    });
  },
});
