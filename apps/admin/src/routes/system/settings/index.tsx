import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/system/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/system/settings/access", replace: true });
  },
});
