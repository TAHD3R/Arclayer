import React from "react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/debug/500")({
  component: Debug500,
});

function Debug500() {
  throw new Error("Internal Error (debug).");
}
