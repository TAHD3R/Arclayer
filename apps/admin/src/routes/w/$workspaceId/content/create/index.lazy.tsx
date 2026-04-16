import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/w/$workspaceId/content/create/")({
  component: BootstrapRouteComponent,
});

function BootstrapRouteComponent() {
  return null;
}
