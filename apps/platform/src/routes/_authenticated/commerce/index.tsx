import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/commerce/")({
  beforeLoad: () => {
    throw redirect({ to: "/commerce/subscriptions" });
  },
});
