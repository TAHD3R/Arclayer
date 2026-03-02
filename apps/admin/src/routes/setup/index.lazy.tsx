import { createLazyFileRoute } from "@tanstack/react-router";

import { SetupPage } from "@/pages/setup/page";

export const Route = createLazyFileRoute("/setup/")({
  component: SetupPage,
});
