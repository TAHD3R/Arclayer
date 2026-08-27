import { createFileRoute } from "@tanstack/react-router";

import { SiteDeliveryRulesPage } from "@/pages/site-delivery-rules";

export const Route = createFileRoute("/_authenticated/hosting/policies")({
  component: SiteDeliveryRulesPage,
});
