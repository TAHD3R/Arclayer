import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/extensions/")({
  component: () => <Navigate replace to="/extensions/installed" />,
});
