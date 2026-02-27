import { createFileRoute } from "@tanstack/react-router";

type ResetPasswordSearch = {
  token?: string;
};

export const Route = createFileRoute("/reset-password/")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => {
    const token = typeof search.token === "string" ? search.token : undefined;
    return token ? { token } : {};
  },
});
