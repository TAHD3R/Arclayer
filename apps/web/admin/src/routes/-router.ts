import { createRouter } from "@tanstack/react-router";

import { routeTree } from "@/routeTree.gen";
import { RouterDefaultError, RouterDefaultNotFound } from "@/views/_builtin/routerFallbacks";

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultErrorComponent: RouterDefaultError,
  defaultNotFoundComponent: RouterDefaultNotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
