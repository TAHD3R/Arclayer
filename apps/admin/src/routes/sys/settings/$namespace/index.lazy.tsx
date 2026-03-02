import { createLazyFileRoute } from "@tanstack/react-router";

import { SysSettingsPage } from "@/pages/sys/settings/page";

export const Route = createLazyFileRoute("/sys/settings/$namespace/")({
  component: SysSettingsPage,
});
