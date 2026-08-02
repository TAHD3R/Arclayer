import { createFileRoute } from "@tanstack/react-router";

import { AiProvidersPage } from "@/pages/ai-services";

export const Route = createFileRoute("/_authenticated/ai/providers")({
  component: AiProvidersPage,
});
