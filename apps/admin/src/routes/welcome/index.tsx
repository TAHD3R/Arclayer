import { createFileRoute } from "@tanstack/react-router";

type WelcomeSearch = {
  dryRun?: "1";
  mode?: "create-workspace";
};

export const Route = createFileRoute("/welcome/")({
  staticData: { titleKey: "onboarding:WELCOME_PAGE_TITLE" },
  validateSearch: (search: Record<string, unknown>): WelcomeSearch => ({
    ...(search.dryRun === "1" ? { dryRun: "1" as const } : {}),
    ...(search.mode === "create-workspace" ? { mode: "create-workspace" as const } : {}),
  }),
});
