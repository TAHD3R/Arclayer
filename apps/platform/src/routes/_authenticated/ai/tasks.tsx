import { createFileRoute } from "@tanstack/react-router";

import { AiTasksPage } from "@/pages/ai-tasks";

export const Route = createFileRoute("/_authenticated/ai/tasks")({ component: AiTasksPage });
