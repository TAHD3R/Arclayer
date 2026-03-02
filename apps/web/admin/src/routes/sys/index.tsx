import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/sys/")({
  beforeLoad: () => {
    throw redirect({ to: "/sys/settings", replace: true });
  },
});
