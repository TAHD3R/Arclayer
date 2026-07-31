import { createFileRoute } from "@tanstack/react-router";

import { PlatformInvitationPage } from "@/pages/access-team";

export const Route = createFileRoute("/_authenticated/access/team/invitations/$invitationId")({
  component: () => <PlatformInvitationPage invitationId={Route.useParams().invitationId} />,
});
