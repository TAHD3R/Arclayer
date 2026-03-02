import { TeamInvitationsView } from "./components/team-invitations-view";

export function TeamInvitationsPage(props: { workspaceIdOverride?: string | null } = {}) {
  return <TeamInvitationsView {...props} />;
}
