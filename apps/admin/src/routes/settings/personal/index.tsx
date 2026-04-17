import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateNotificationsSourceSearch } from "@/lib/routing/notifications-source";

export const Route = createFileRoute("/settings/personal/")({
  validateSearch: validateNotificationsSourceSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/settings/personal/profile", search, replace: true });
  },
});
