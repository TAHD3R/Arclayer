import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/projects/$projectId/content/create/")({
  component: ProjectContentCreateRouteComponent,
});

function ProjectContentCreateRouteComponent() {
  return null;
}
