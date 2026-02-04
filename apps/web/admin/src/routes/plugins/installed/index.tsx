import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/pages/placeholder/page";

export const Route = createFileRoute("/plugins/installed/")({
  component: () => <PlaceholderView titleKey="nav:NAV_PLUGINS_INSTALLED" />,
});
