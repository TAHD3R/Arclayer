import { getRouteApi } from "@tanstack/react-router";

import { AcceptInviteView } from "./components/accept-invite-view";

const acceptInviteRouteApi = getRouteApi("/accept-invite/");

export function AcceptInvitePage() {
  const { token } = acceptInviteRouteApi.useSearch();
  return <AcceptInviteView token={token ?? null} />;
}
