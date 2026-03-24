import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateNotificationsSourceSearch } from "@/lib/routing/notifications-source";

export const Route = createFileRoute("/usercenter/")({
  validateSearch: validateNotificationsSourceSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/usercenter/profile", search, replace: true });
  },
});
