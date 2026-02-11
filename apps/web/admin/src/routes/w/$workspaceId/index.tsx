import { createFileRoute } from "@tanstack/react-router";

import { DashboardView } from "@/pages/workspaces/dashboard/page";

export const Route = createFileRoute("/w/$workspaceId/")({
  component: DashboardView,
});
