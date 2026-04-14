import { createFileRoute, redirect } from "@tanstack/react-router";

import { getWorkspaceDetail } from "@/api/workspaces";

export const Route = createFileRoute("/w/$workspaceId/team/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_TEAM" },
  beforeLoad: async ({ params }) => {
    const workspace = await getWorkspaceDetail(params.workspaceId);
    if (workspace.kind === "personal") {
      throw redirect({
        to: "/w/$workspaceId",
        params: { workspaceId: params.workspaceId },
      });
    }
  },
});
