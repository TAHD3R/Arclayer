import { createFileRoute } from "@tanstack/react-router";

import { AssetsView } from "@/views/assets/AssetsView";

export const Route = createFileRoute("/assets/")({
  component: AssetsView,
});
