import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/editor/")({
  staticData: { titleKey: "nav:NAV_PROJECT_EDITOR" },
});
