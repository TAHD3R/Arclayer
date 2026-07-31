import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/communications/")({
  component: () => <Navigate replace to="/communications/feedback" />,
});
