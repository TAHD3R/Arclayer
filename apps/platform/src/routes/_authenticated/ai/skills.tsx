import { createFileRoute } from "@tanstack/react-router";

import { AiSkillsPage } from "@/pages/ai-skills";

export const Route = createFileRoute("/_authenticated/ai/skills")({
  component: AiSkillsPage,
});
