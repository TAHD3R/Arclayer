import { createFileRoute } from "@tanstack/react-router";

import { CustomizationPage } from "@/pages/customization/page";

type CustomizationSkillsSearch = {
  action?: "manual" | "github" | "zip";
};

const ACTIONS = new Set(["manual", "github", "zip"]);

export const Route = createFileRoute("/customization/skills/")({
  validateSearch: (search: Record<string, unknown>): CustomizationSkillsSearch =>
    typeof search.action === "string" && ACTIONS.has(search.action)
      ? { action: search.action as CustomizationSkillsSearch["action"] }
      : {},
  staticData: { titleKey: "settings:CUSTOMIZATION_SKILLS_TITLE" },
  component: CustomizationSkillsRoute,
});

function CustomizationSkillsRoute() {
  const search = Route.useSearch();
  return <CustomizationPage section="skills" requestedAction={search.action} />;
}
