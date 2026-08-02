import { createFileRoute } from "@tanstack/react-router";

import { PlatformSessionsPage } from "@/pages/access-sessions";

export const Route = createFileRoute("/_authenticated/access/sessions")({
  component: PlatformSessionsPage,
});
