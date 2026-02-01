import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/views/PlaceholderView";

export const Route = createFileRoute("/w/$workspaceId/content/pages/")({
  component: () => <PlaceholderView titleKey="nav:NAV_CONTENT_PAGES" />,
});
