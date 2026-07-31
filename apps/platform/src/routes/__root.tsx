import { createRootRoute, Outlet, redirect } from "@tanstack/react-router";

import { RouterError, RouterNotFound } from "@/components/router-fallbacks";
import { getPlatformSetupState } from "@/setup/setup-api";

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const setupState = await getPlatformSetupState();
    if (setupState.status !== "ready" && location.pathname !== "/setup") {
      throw redirect({ to: "/setup" });
    }
    if (setupState.status === "ready" && location.pathname === "/setup") {
      throw redirect({ to: "/sign-in" });
    }
    return { setupState };
  },
  component: Outlet,
  errorComponent: RouterError,
  notFoundComponent: RouterNotFound,
});
