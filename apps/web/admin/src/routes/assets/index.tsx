import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/views/PlaceholderView";

export const Route = createFileRoute("/assets/")({
  component: () => <PlaceholderView titleKey="common:NAV_ASSETS" />,
});
