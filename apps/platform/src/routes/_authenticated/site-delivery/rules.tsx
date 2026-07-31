import { createFileRoute } from "@tanstack/react-router";

import { SiteDeliveryRulesPage } from "@/pages/site-delivery";

export const Route = createFileRoute("/_authenticated/site-delivery/rules")({
  component: SiteDeliveryRulesPage,
});
