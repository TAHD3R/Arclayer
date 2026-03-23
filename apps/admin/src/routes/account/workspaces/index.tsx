import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/account/workspaces/")({
  validateSearch: (search: Record<string, unknown>) => ({
    create: search.create === "1" ? "1" : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/workspaces", search, replace: true });
  },
});
