import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/pages/placeholder/page";

export const Route = createFileRoute("/appearance/themes/")({
  component: () => <PlaceholderView titleKey="nav:NAV_APPEARANCE_THEMES" />,
});
