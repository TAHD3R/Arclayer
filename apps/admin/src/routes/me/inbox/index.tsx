import { createFileRoute } from "@tanstack/react-router";
import { validateInboxSourceSearch } from "@/lib/routing/inbox-source";

export const Route = createFileRoute("/me/inbox/")({
  staticData: { titleKey: "notifications:NOTIFICATIONS_PAGE_TITLE" },
  validateSearch: validateInboxSourceSearch,
});
