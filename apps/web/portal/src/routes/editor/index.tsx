import React from "react";
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/editor/")({
  component: EditorLayout,
});

function EditorLayout() {
  // Editor mode UI is introduced in Sprint 2. For now, we only provide a dedicated route namespace.
  return <Outlet />;
}
