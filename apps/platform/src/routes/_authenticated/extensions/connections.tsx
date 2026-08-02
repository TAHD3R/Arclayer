import { createFileRoute } from "@tanstack/react-router";

import { ExtensionsConnectionsPage } from "@/pages/extensions";

export const Route = createFileRoute("/_authenticated/extensions/connections")({
  component: ExtensionsConnectionsPage,
});
