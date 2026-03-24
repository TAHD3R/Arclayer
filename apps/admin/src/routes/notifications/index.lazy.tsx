import { createLazyFileRoute } from "@tanstack/react-router";

import { NotificationsPage } from "@/pages/notifications/page";

export const Route = createLazyFileRoute("/notifications/")({
  component: NotificationsPage,
});
