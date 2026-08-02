import { createFileRoute } from "@tanstack/react-router";

import { AiPoliciesPage } from "@/pages/ai-services";

export const Route = createFileRoute("/_authenticated/ai/policies")({ component: AiPoliciesPage });
