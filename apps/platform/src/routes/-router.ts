import { createRouter } from "@tanstack/react-router";

import { RouterError, RouterNotFound } from "@/components/router-fallbacks";
import { routeTree } from "@/routeTree.gen";

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultErrorComponent: RouterError,
  defaultNotFoundComponent: RouterNotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
