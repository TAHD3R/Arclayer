import { createFileRoute } from "@tanstack/react-router";

import { PlatformOverviewPage } from "@/pages/platform-overview";

export const Route = createFileRoute("/_authenticated/")({
  component: PlatformOverviewPage,
});
