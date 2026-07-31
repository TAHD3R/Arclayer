import { createFileRoute } from "@tanstack/react-router";

import { PlatformSignInReadinessPage } from "@/pages/access-sign-in";

export const Route = createFileRoute("/_authenticated/access/sign-in")({
  component: PlatformSignInReadinessPage,
});
