import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/views/PlaceholderView";

export const Route = createFileRoute("/appearance/navigation/")({
  component: () => <PlaceholderView titleKey="common:NAV_APPEARANCE_NAVIGATION" />,
});
