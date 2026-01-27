import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/views/PlaceholderView";

export const Route = createFileRoute("/settings/team/roles/")({
  component: () => <PlaceholderView titleKey="common:NAV_SETTINGS_TEAM_ROLES" />,
});
