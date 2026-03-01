import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/me/notifications/")({
  staticData: { titleKey: "account:ME_TAB_NOTIFICATIONS" },
});
