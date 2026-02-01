import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/views/PlaceholderView";

export const Route = createFileRoute("/w/$workspaceId/appearance/themes/")({
  component: () => <PlaceholderView titleKey="nav:NAV_APPEARANCE_THEMES" />,
});
