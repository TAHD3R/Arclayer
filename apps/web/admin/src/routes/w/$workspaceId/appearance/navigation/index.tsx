import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/pages/placeholder/page";

export const Route = createFileRoute("/w/$workspaceId/appearance/navigation/")({
  component: () => <PlaceholderView titleKey="nav:NAV_APPEARANCE_NAVIGATION" />,
});
