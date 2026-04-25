import { createFileRoute } from "@tanstack/react-router";

type WelcomeSearch = {
  dryRun?: "1";
};

export const Route = createFileRoute("/welcome/")({
  staticData: { titleKey: "onboarding:WELCOME_PAGE_TITLE" },
  validateSearch: (search: Record<string, unknown>): WelcomeSearch =>
    search.dryRun === "1" ? { dryRun: "1" } : {},
});
