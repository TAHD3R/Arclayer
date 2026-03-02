import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/repair/")({
  beforeLoad: () => {
    throw redirect({ to: "/repair/master-key", replace: true });
  },
});
