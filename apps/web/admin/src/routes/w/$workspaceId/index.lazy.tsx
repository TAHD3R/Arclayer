import { createLazyFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/pages/workspaces/dashboard/page";

export const Route = createLazyFileRoute("/w/$workspaceId/")({
  component: DashboardPage,
});
