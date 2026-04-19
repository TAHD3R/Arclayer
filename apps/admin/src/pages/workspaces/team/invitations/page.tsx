import { TeamInvitationsView } from "./components/team-invitations-view";

export function TeamInvitationsPage(
  props: {
    workspaceIdOverride?: string | null;
    inviteLinkOpen?: boolean;
    onInviteLinkOpenChange?: (open: boolean) => void;
    inviteEmailOpen?: boolean;
    onInviteEmailOpenChange?: (open: boolean) => void;
    embedded?: boolean;
  } = {},
) {
  return <TeamInvitationsView {...props} />;
}
