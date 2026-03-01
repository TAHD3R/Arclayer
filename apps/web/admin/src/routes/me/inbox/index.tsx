import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/me/inbox/")({
  staticData: { titleKey: "notifications:NOTIFICATIONS_PAGE_TITLE" },
});
