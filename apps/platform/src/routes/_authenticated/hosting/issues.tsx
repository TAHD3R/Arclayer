import { createFileRoute } from "@tanstack/react-router";

import { SiteDeliveryIssuesPage } from "@/pages/site-delivery";

export const Route = createFileRoute("/_authenticated/hosting/issues")({
  component: SiteDeliveryIssuesPage,
});
