import { createLazyFileRoute } from "@tanstack/react-router";

import { MeNotificationSettingsPage } from "@/pages/me/notifications/page";

export const Route = createLazyFileRoute("/me/notifications/")({
  component: MeNotificationSettingsPage,
});
