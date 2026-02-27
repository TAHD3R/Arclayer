import { createLazyFileRoute } from "@tanstack/react-router";

import { GeneralSiteSettingsPage } from "@/pages/workspaces/settings/general/site/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/general/site/")({
  component: GeneralSiteSettingsPage,
});
