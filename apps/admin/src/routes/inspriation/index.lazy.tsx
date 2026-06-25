import { createLazyFileRoute } from "@tanstack/react-router";

import { InspirationPage } from "@/pages/inspiration/page";

export const Route = createLazyFileRoute("/inspriation/")({
  component: InspirationPage,
});
