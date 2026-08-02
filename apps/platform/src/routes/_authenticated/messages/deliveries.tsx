import { createFileRoute } from "@tanstack/react-router";

import { CommunicationsDeliveriesPage } from "@/pages/communications";

type DeliverySearch = Readonly<{ campaignId?: string }>;

export const Route = createFileRoute("/_authenticated/messages/deliveries")({
  validateSearch: (search: Record<string, unknown>): DeliverySearch => ({
    campaignId:
      typeof search.campaignId === "string" && search.campaignId.trim()
        ? search.campaignId.trim()
        : undefined,
  }),
  component: () => <CommunicationsDeliveriesPage campaignId={Route.useSearch().campaignId} />,
});
