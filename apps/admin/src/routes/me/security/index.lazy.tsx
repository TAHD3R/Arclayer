import { createLazyFileRoute } from "@tanstack/react-router";

import { MeSecurityPage } from "@/pages/me/security/page";

export const Route = createLazyFileRoute("/me/security/")({
  component: MeSecurityPage,
});
