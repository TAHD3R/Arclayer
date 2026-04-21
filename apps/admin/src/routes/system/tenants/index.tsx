import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/system/tenants/")({
  beforeLoad: () => {
    throw redirect({ to: "/system/tenants/users", replace: true });
  },
});
