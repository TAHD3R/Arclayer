import { createLazyFileRoute } from "@tanstack/react-router";

import { AcceptInvitePage } from "@/pages/accept-invite/page";

export const Route = createLazyFileRoute("/accept-invite/")({
  component: AcceptInvitePage,
});
