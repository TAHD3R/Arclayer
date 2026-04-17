import { createFileRoute } from "@tanstack/react-router";

import { SettingsRouteBridge } from "@/pages/settings/settings-shell";

export const Route = createFileRoute("/settings")({
  component: SettingsRouteBridge,
});
