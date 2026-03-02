import { createFileRoute } from "@tanstack/react-router";

import { requireDeploymentScope } from "@/lib/system/runtime-guards";

export const Route = createFileRoute("/w/$workspaceId/settings/maintenance/status/")({
  beforeLoad: async () => {
    await requireDeploymentScope("self_host");
  },
  staticData: { titleKey: "nav:NAV_SETTINGS_MAINTENANCE_STATUS" },
});
