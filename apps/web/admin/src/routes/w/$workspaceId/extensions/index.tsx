import { createFileRoute } from "@tanstack/react-router";

import { ExtensionsPage } from "@/pages/extensions/extensions-page";

export const Route = createFileRoute("/w/$workspaceId/extensions/")({
  component: ExtensionsPage,
});
