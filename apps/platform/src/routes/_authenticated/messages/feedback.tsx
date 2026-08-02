import { createFileRoute } from "@tanstack/react-router";

import { CommunicationsFeedbackPage } from "@/pages/communications";

export const Route = createFileRoute("/_authenticated/messages/feedback")({
  component: CommunicationsFeedbackPage,
});
