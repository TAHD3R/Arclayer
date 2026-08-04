import { createFileRoute } from "@tanstack/react-router";

import { PlatformSignInSettingsPage } from "@/pages/access-sign-in";

export const Route = createFileRoute("/_authenticated/access/sign-in")({
  component: PlatformSignInSettingsPage,
});
