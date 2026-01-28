import { createFileRoute } from "@tanstack/react-router";

import { GeneralSettingsView } from "@/views/settings/GeneralSettingsView";

export const Route = createFileRoute("/settings/general/")({
  component: GeneralSettingsView,
});
