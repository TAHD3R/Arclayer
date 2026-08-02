import { createFileRoute } from "@tanstack/react-router";

import { SiteDeliveryRulesPage } from "@/pages/site-delivery";

export const Route = createFileRoute("/_authenticated/hosting/policies")({
  component: SiteDeliveryRulesPage,
});
