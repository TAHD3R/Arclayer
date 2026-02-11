import { createFileRoute } from "@tanstack/react-router";

import { AssetsView } from "@/pages/workspaces/assets/page";

export const Route = createFileRoute("/w/$workspaceId/assets/")({
  component: AssetsView,
});
