import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/extensions/")({
  staticData: { titleKey: "nav:NAV_EXTENSIONS" },
});
