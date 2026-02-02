import React from "react";
import { createFileRoute } from "@tanstack/react-router";

import { HttpError } from "../../router/routerFallbacks";

export const Route = createFileRoute("/debug/403")({
  component: Debug403,
});

function Debug403() {
  throw new HttpError(403, "Forbidden (debug).");
}
