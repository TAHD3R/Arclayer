import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/pages/placeholder/page";

export const Route = createFileRoute("/content/pages/")({
  component: () => <PlaceholderView titleKey="nav:NAV_CONTENT_PAGES" />,
});
