import { createFileRoute } from "@tanstack/react-router";

import { requireDeploymentSettingsEnabled } from "@/lib/system/runtime-guards";

export const Route = createFileRoute("/o/$orgId/settings/deployment/")({
  beforeLoad: async () => {
    await requireDeploymentSettingsEnabled();
  },
  staticData: { titleKey: "nav:NAV_ORG_SETTINGS" },
});
