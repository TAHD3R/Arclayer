import { createFileRoute } from "@tanstack/react-router";

type AcceptInviteSearch = {
  token?: string;
};

export const Route = createFileRoute("/accept-invite/")({
  validateSearch: (search: Record<string, unknown>): AcceptInviteSearch => {
    const token = typeof search.token === "string" ? search.token.trim() : "";
    return token ? { token } : {};
  },
});
