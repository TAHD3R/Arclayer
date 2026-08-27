import { createFileRoute } from "@tanstack/react-router";

import { AiProvidersPage } from "@/pages/ai-providers";

export const Route = createFileRoute("/_authenticated/ai/providers")({
  component: AiProvidersPage,
});
