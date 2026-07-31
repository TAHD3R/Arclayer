import { createFileRoute } from "@tanstack/react-router";

import { SiteDeliveryDomainsPage } from "@/pages/site-delivery";

export const Route = createFileRoute("/_authenticated/site-delivery/domains")({
  component: SiteDeliveryDomainsPage,
});
