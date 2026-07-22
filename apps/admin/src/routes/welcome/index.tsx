import { createFileRoute } from "@tanstack/react-router";

type WelcomeSearch = {
  dryRun?: "1";
  mode?: "create-workspace" | "invitation";
  redirect?: string;
};

export const Route = createFileRoute("/welcome/")({
  staticData: { titleKey: "onboarding:WELCOME_PAGE_TITLE" },
  validateSearch: (search: Record<string, unknown>): WelcomeSearch => {
    const redirect =
      typeof search.redirect === "string" &&
      search.redirect.startsWith("/") &&
      !search.redirect.startsWith("//")
        ? search.redirect
        : undefined;
    const mode =
      search.mode === "create-workspace"
        ? "create-workspace"
        : search.mode === "invitation"
          ? "invitation"
          : undefined;
    return {
      ...(search.dryRun === "1" ? { dryRun: "1" as const } : {}),
      ...(mode ? { mode } : {}),
      ...(redirect ? { redirect } : {}),
    };
  },
});
