import { createFileRoute } from "@tanstack/react-router";
import { CommerceSubscriptionsPage } from "@/pages/commerce-subscriptions";
export const Route = createFileRoute("/_authenticated/billing/subscriptions")({
  component: CommerceSubscriptionsPage,
});
