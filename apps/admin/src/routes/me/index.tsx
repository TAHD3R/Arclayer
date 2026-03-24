import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateInboxSourceSearch } from "@/lib/routing/inbox-source";

export const Route = createFileRoute("/me/")({
  validateSearch: validateInboxSourceSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/me/inbox", search, replace: true });
  },
});
