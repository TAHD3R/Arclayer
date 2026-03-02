import { createLazyFileRoute } from "@tanstack/react-router";

import { InvitationsPage } from "@/pages/invitations/page";

export const Route = createLazyFileRoute("/invitations/")({
  component: InvitationsPage,
});
