import { createFileRoute } from "@tanstack/react-router";

import { SiteDeliveryStoragePage } from "@/pages/site-delivery-storage";

export const Route = createFileRoute("/_authenticated/hosting/storage")({
  component: SiteDeliveryStoragePage,
});
