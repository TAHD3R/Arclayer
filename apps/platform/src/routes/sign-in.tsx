import { createFileRoute, redirect } from "@tanstack/react-router";

import { readPlatformSession } from "@/auth/platform-session";
import { PlatformSignInPage } from "@/pages/platform-sign-in";

export const Route = createFileRoute("/sign-in")({
  beforeLoad: () => {
    if (readPlatformSession()) throw redirect({ to: "/" });
  },
  component: PlatformSignInPage,
});
