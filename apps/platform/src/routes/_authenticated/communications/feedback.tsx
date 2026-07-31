import { createFileRoute } from "@tanstack/react-router";
import { CommunicationsFeedbackPage } from "@/pages/communications";

export const Route = createFileRoute("/_authenticated/communications/feedback")({
  component: CommunicationsFeedbackPage,
});
