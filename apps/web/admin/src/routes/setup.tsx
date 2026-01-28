import { createFileRoute } from "@tanstack/react-router";

import { SetupView } from "@/views/SetupView";

export const Route = createFileRoute("/setup")({
  component: SetupView,
});
