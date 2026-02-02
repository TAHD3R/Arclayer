import React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { HttpError } from "../../router/routerFallbacks";

export const Route = createFileRoute("/debug/403")({
  loader: () => {
    // Throw in loader so SSR can determine the HTTP status code before rendering.
    throw new HttpError(403, "Forbidden (debug).");
  },
  component: Debug403,
});

function Debug403() {
  // The error UI is rendered by the router-level error component.
  return null;
}
