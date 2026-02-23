import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/notifications/")({
  beforeLoad: () => {
    throw redirect({ to: "/me/notifications", replace: true });
  },
});
