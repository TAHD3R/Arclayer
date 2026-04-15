import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/usercenter/danger/")({
  beforeLoad: () => {
    throw redirect({ to: "/usercenter/profile", replace: true });
  },
});
