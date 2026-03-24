import { createFileRoute } from "@tanstack/react-router";
import { validateNotificationsSourceSearch } from "@/lib/routing/notifications-source";

export const Route = createFileRoute("/notifications/")({
  staticData: { titleKey: "notifications:NOTIFICATIONS_PAGE_TITLE" },
  validateSearch: validateNotificationsSourceSearch,
});
