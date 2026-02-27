import { createFileRoute } from "@tanstack/react-router";

type InvitationsSearch = {
  token?: string;
};

export const Route = createFileRoute("/invitations/")({
  validateSearch: (search: Record<string, unknown>): InvitationsSearch => {
    const token = typeof search.token === "string" ? search.token.trim() : "";
    return token ? { token } : {};
  },
});
