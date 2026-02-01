import { createFileRoute } from "@tanstack/react-router";

import { NotificationsPage } from "@/routes/notifications";

export const Route = createFileRoute("/w/$workspaceId/notifications/")({
  component: NotificationsPage,
});
