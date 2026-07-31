import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/site-delivery/")({
  beforeLoad: () => {
    throw redirect({ to: "/site-delivery/issues" });
  },
});
