import { createLazyFileRoute } from "@tanstack/react-router";

import { GeneralSiteSettingsPage } from "@/pages/workspaces/settings/site/basics/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/site/basics/")({
  component: GeneralSiteSettingsPage,
});
