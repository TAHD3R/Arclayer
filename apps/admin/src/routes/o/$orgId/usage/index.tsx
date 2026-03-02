import { createFileRoute } from "@tanstack/react-router";

import { requireDeploymentScope } from "@/lib/system/runtime-guards";

export const Route = createFileRoute("/o/$orgId/usage/")({
  beforeLoad: async () => {
    await requireDeploymentScope("saas");
  },
  staticData: { titleKey: "nav:NAV_ORG_USAGE" },
});
