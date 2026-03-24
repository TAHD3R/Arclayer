import { createLazyFileRoute } from "@tanstack/react-router";

import { GeneralLocalizationSettingsPage } from "@/pages/workspaces/settings/site/localization/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/site/localization/")({
  component: GeneralLocalizationSettingsPage,
});
