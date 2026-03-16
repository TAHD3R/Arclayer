import { createLazyFileRoute } from "@tanstack/react-router";

import { GeneralLocalizationSettingsPage } from "@/pages/workspaces/settings/general/localization/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/site/localization/")({
  component: GeneralLocalizationSettingsPage,
});
