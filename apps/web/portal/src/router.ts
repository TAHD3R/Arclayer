import { createMemoryHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import { RouterDefaultError, RouterDefaultNotFound } from "./router/routerFallbacks";

export type PortalRouter = ReturnType<typeof createPortalRouter>;

export function createPortalRouter(args: { kind: "server" | "client"; url: string }) {
  const isServer = args.kind === "server";

  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultErrorComponent: RouterDefaultError,
    defaultNotFoundComponent: RouterDefaultNotFound,
  });

  if (isServer) {
    const history = createMemoryHistory({
      initialEntries: [args.url],
    });
    router.update({ history });
  }

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createPortalRouter>;
  }
}
