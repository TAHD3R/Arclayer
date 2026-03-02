import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/notifications/")({
  staticData: { titleKey: "notifications:NOTIFICATIONS_PAGE_TITLE" },
  beforeLoad: () => {
    throw redirect({ to: "/me/inbox", replace: true });
  },
});
