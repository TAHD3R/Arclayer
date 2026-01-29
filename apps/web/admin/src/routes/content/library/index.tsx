import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/views/PlaceholderView";

export const Route = createFileRoute("/content/library/")({
  component: () => <PlaceholderView titleKey="nav:NAV_CONTENT_LIBRARY" />,
});
