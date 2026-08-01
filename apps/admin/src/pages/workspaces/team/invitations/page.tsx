import { TeamInvitationsView } from "./components/team-invitations-view";
import type { TabKey } from "./types";

export function TeamInvitationsPage(
  props: {
    workspaceIdOverride?: string | null;
    inviteLinkOpen?: boolean;
    onInviteLinkOpenChange?: (open: boolean) => void;
    inviteEmailOpen?: boolean;
    onInviteEmailOpenChange?: (open: boolean) => void;
    fixedTab?: TabKey;
    embedded?: boolean;
  } = {},
) {
  return <TeamInvitationsView {...props} />;
}
