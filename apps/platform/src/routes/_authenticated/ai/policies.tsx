import { createFileRoute } from "@tanstack/react-router";

import { AiPoliciesPage } from "@/pages/ai-policies";

export const Route = createFileRoute("/_authenticated/ai/policies")({ component: AiPoliciesPage });
