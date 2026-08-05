import { createFileRoute } from "@tanstack/react-router";

type ResetPasswordSearch = {
  token?: string;
};

export const Route = createFileRoute("/reset-password/")({
  staticData: { titleKey: "auth:RESET_PASSWORD_PAGE_TITLE" },
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => {
    const token = typeof search.token === "string" ? search.token : undefined;
    return token ? { token } : {};
  },
});
