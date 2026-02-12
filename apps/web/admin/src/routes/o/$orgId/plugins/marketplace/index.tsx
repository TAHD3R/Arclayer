import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/pages/placeholder/page";

export const Route = createFileRoute("/o/$orgId/plugins/marketplace/")({
  component: PluginsMarketplacePage,
});

function PluginsMarketplacePage() {
  return <PlaceholderView titleKey="nav:NAV_PLUGINS_MARKETPLACE" />;
}
