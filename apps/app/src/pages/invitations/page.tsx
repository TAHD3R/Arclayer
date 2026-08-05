import { getRouteApi } from "@tanstack/react-router";
import { InvitationsView } from "./components/invitations-view";

const invitationsRouteApi = getRouteApi("/invitations/");

export function InvitationsPage() {
  const { token } = invitationsRouteApi.useSearch();
  return <InvitationsView token={token ?? null} />;
}
