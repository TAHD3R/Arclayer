import { createFileRoute } from "@tanstack/react-router";

import { PlatformMfaPage } from "@/pages/access-mfa";

export const Route = createFileRoute("/_authenticated/access/mfa")({
  component: PlatformMfaPage,
});
