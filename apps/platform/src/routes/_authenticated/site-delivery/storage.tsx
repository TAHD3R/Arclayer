import { createFileRoute } from "@tanstack/react-router";

import { SiteDeliveryStoragePage } from "@/pages/site-delivery";

export const Route = createFileRoute("/_authenticated/site-delivery/storage")({
  component: SiteDeliveryStoragePage,
});
