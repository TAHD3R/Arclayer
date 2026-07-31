import { createFileRoute } from "@tanstack/react-router";

import { PlatformTeamPage } from "@/pages/access-team";

export const Route = createFileRoute("/_authenticated/access/team")({
  component: PlatformTeamPage,
});
