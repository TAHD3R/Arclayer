import { createFileRoute } from "@tanstack/react-router";

import { CustomizationPage } from "@/pages/customization/page";

type CustomizationSkillsSearch = {
  action?: "import";
};

export const Route = createFileRoute("/customization/skills/")({
  validateSearch: (search: Record<string, unknown>): CustomizationSkillsSearch =>
    search.action === "import" ? { action: "import" } : {},
  staticData: { titleKey: "settings:CUSTOMIZATION_SKILLS_TITLE" },
  component: CustomizationSkillsRoute,
});

function CustomizationSkillsRoute() {
  const search = Route.useSearch();
  return <CustomizationPage section="skills" requestedAction={search.action} />;
}
