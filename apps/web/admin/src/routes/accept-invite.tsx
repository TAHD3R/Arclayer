import { createFileRoute } from "@tanstack/react-router";

import { AcceptInviteView } from "@/views/AcceptInviteView";

type AcceptInviteSearch = {
  token?: string;
};

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (search: Record<string, unknown>): AcceptInviteSearch => {
    const token = typeof search.token === "string" ? search.token.trim() : "";
    return token ? { token } : {};
  },
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  return <AcceptInviteView token={token ?? null} />;
}
