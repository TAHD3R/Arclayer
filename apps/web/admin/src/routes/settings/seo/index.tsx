import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/views/PlaceholderView";

export const Route = createFileRoute("/settings/seo/")({
  component: () => <PlaceholderView titleKey="common:NAV_SETTINGS_SEO" />,
});
