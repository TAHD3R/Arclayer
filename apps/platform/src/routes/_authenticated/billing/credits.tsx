import { createFileRoute } from "@tanstack/react-router";
import { CommerceCreditsPage } from "@/pages/commerce-credits";
export const Route = createFileRoute("/_authenticated/billing/credits")({
  component: CommerceCreditsPage,
});
