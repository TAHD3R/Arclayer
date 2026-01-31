import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";

// Backward-compatible route alias:
// - Old: /settings/team/members
// - New: /team/invitations
export const Route = createFileRoute("/settings/team/members/")({
  component: SettingsTeamMembersRedirect,
});

function SettingsTeamMembersRedirect() {
  const navigate = useNavigate();

  React.useEffect(() => {
    void navigate({ to: "/team/invitations", replace: true });
  }, [navigate]);

  return null;
}
