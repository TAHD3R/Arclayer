import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/pages/placeholder/page";

export const Route = createFileRoute("/w/$workspaceId/content/library/")({
  component: () => <PlaceholderView titleKey="nav:NAV_CONTENT_LIBRARY" />,
});
