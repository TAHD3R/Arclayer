import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/views/PlaceholderView";

export const Route = createFileRoute("/settings/seo/")({
  component: () => <PlaceholderView titleKey="nav:NAV_SETTINGS_SEO" />,
});
