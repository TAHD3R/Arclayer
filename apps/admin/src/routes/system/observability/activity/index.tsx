import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/system/observability/activity/")({
  beforeLoad: () => {
    throw redirect({ to: "/system/audit-log", replace: true });
  },
});
