import { createLazyFileRoute } from "@tanstack/react-router";

import { MePreferencesPage } from "@/pages/me/preferences/page";

export const Route = createLazyFileRoute("/me/preferences/")({
  component: MePreferencesPage,
});
