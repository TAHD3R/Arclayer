import { createFileRoute, redirect } from "@tanstack/react-router";
import { validateInboxSourceSearch } from "@/lib/routing/inbox-source";

export const Route = createFileRoute("/account/")({
  validateSearch: validateInboxSourceSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/account/profile", search, replace: true });
  },
});
