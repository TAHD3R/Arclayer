import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/views/PlaceholderView";

export const Route = createFileRoute("/plugins/installed/")({
  component: () => <PlaceholderView titleKey="nav:NAV_PLUGINS_INSTALLED" />,
});
