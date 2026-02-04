import { createFileRoute } from "@tanstack/react-router";

import { AssetsView } from "@/pages/assets/page";

export const Route = createFileRoute("/assets/")({
  component: AssetsView,
});
