import { createLazyFileRoute } from "@tanstack/react-router";

import { GeneralSettingsPage } from "@/pages/workspaces/settings/general/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/general/")({
  component: GeneralSettingsPage,
});
