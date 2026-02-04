import { createFileRoute } from "@tanstack/react-router";

import { SetupView } from "@/pages/setup/page";

export const Route = createFileRoute("/setup")({
  component: SetupView,
});
