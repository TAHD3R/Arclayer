import { createFileRoute } from "@tanstack/react-router";
import { CommunicationsTemplatesPage } from "@/pages/communications";

export const Route = createFileRoute("/_authenticated/communications/templates")({
  component: CommunicationsTemplatesPage,
});
