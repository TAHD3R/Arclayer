import { createFileRoute } from "@tanstack/react-router";

import { AiAssistantsPage } from "@/pages/ai-services";

export const Route = createFileRoute("/_authenticated/ai/assistants")({
  component: AiAssistantsPage,
});
