import { createFileRoute } from "@tanstack/react-router";

import { CommunicationsTemplatesPage } from "@/pages/communications";

export const Route = createFileRoute("/_authenticated/messages/templates")({
  component: CommunicationsTemplatesPage,
});
