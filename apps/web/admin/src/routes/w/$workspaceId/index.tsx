import { createFileRoute } from "@tanstack/react-router";

import { DashboardView } from "@/pages/dashboard/page";

export const Route = createFileRoute("/w/$workspaceId/")({
  component: DashboardView,
});
