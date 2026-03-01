import { createLazyFileRoute } from "@tanstack/react-router";

import { MeProfilePage } from "@/pages/me/profile/page";

export const Route = createLazyFileRoute("/me/profile/")({
  component: MeProfilePage,
});
