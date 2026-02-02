import { createMemoryHistory, createRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import { RouterDefaultError, RouterDefaultNotFound } from "./router/routerFallbacks";
import { rewritePortalInputPathname, rewritePortalOutputPathname } from "./router/rewrite";

export type PortalRouter = ReturnType<typeof createPortalRouter>;

export type PortalViewerContext = {
  locale: "zh-CN" | "en-US";
  fallbackLocale?: "zh-CN" | "en-US";
};

export type PortalRouteContext = {
  viewerCtx: PortalViewerContext;
};

export function createPortalRouter(args: {
  kind: "server" | "client";
  url: string;
  viewerCtx: PortalViewerContext;
}) {
  const isServer = args.kind === "server";

  const router = createRouter({
    routeTree,
    context: {
      viewerCtx: args.viewerCtx,
    } satisfies PortalRouteContext,
    rewrite: {
      // Sprint 2+ (editor mode): keep `/__editor/*` as a public namespace while our file-based routes
      // avoid `__` segments (TanStack Router reserves `__` for special files like `__root`).
      input: ({ url }) => {
        const next = new URL(url);
        next.pathname = rewritePortalInputPathname(next.pathname);
        return next;
      },
      output: ({ url }) => {
        const next = new URL(url);
        next.pathname = rewritePortalOutputPathname(next.pathname);
        return next;
      },
    },
    defaultPreload: "intent",
    defaultErrorComponent: RouterDefaultError,
    defaultNotFoundComponent: RouterDefaultNotFound,
  });

  if (isServer) {
    const history = createMemoryHistory({
      initialEntries: [args.url],
    });
    router.update({
      history,
      context: {
        viewerCtx: args.viewerCtx,
      },
    });
  }

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createPortalRouter>;
  }
}
