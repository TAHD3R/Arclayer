import { createFileRoute } from "@tanstack/react-router";

import { AiTasksPage } from "@/pages/ai-services";

export const Route = createFileRoute("/_authenticated/ai/tasks")({ component: AiTasksPage });
