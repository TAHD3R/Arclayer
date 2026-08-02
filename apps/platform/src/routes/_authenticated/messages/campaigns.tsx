import { createFileRoute } from "@tanstack/react-router";

import { CommunicationsCampaignsPage } from "@/pages/communications";

export const Route = createFileRoute("/_authenticated/messages/campaigns")({
  component: CommunicationsCampaignsPage,
});
