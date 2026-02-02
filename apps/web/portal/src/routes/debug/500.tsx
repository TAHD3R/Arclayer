import React from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/debug/500")({
  loader: () => {
    // Throw in loader so SSR can determine the HTTP status code before rendering.
    throw new Error("Internal Error (debug).");
  },
  component: Debug500,
});

function Debug500() {
  // The error UI is rendered by the router-level error component.
  return null;
}
