import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/views/PlaceholderView";

export const Route = createFileRoute("/settings/general/")({
  component: () => <PlaceholderView titleKey="common:NAV_SETTINGS_GENERAL" />,
});
