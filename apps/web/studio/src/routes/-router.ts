import { createRouter } from "@tanstack/react-router";

import { RouterDefaultError, RouterDefaultNotFound } from "@/components/builtin/router-fallbacks";
import { routeTree } from "@/routeTree.gen";

const baseUrl = import.meta.env.BASE_URL;
const basepath = baseUrl === "/" ? "/" : baseUrl.replace(/\/$/, "");

export const router = createRouter({
  routeTree,
  basepath,
  trailingSlash: "always",
  defaultPreload: "intent",
  defaultNotFoundComponent: RouterDefaultNotFound,
  defaultErrorComponent: RouterDefaultError,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
