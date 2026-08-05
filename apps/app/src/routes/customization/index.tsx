import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/customization/")({
  beforeLoad: () => {
    throw redirect({ to: "/customization/knowledge" });
  },
});
