import { createFileRoute } from "@tanstack/react-router";
import { CommunicationsEmailPage } from "@/pages/communications";

export const Route = createFileRoute("/_authenticated/communications/email")({
  component: CommunicationsEmailPage,
});
