import { createLazyFileRoute } from "@tanstack/react-router";

import { ExtensionsPage } from "@/pages/extensions/page";

export const Route = createLazyFileRoute("/w/$workspaceId/extensions/")({
  component: ExtensionsPage,
});
