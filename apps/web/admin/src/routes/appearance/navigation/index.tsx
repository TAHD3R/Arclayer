import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/appearance/navigation/")({
  beforeLoad: () => {
    throw redirect({ to: "/content/pages" });
  },
});
