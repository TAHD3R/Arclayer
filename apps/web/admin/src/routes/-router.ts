import { createRouter } from "@tanstack/react-router";

import { RouterDefaultError, RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";
import { routeTree } from "@/routeTree.gen";

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultNotFoundComponent: RouterDefaultNotFound,
  defaultErrorComponent: RouterDefaultError,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
