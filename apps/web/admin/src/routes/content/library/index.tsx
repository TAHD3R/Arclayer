import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/pages/placeholder/page";

export const Route = createFileRoute("/content/library/")({
  component: () => <PlaceholderView titleKey="nav:NAV_CONTENT_LIBRARY" />,
});
