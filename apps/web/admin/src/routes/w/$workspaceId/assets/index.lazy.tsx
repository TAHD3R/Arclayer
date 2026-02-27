import { createLazyFileRoute } from "@tanstack/react-router";

import { AssetsPage } from "@/pages/workspaces/assets/page";

export const Route = createLazyFileRoute("/w/$workspaceId/assets/")({
  component: AssetsPage,
});
