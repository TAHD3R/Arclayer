import { createLazyFileRoute } from "@tanstack/react-router";

import { ProjectActivityPage } from "@/pages/workspaces/activity/page";

export const Route = createLazyFileRoute("/projects/$projectId/activity/")({
  component: ProjectActivityPage,
});
