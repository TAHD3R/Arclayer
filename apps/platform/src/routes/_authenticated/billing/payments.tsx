import { createFileRoute } from "@tanstack/react-router";
import { CommercePaymentsPage } from "@/pages/commerce-payments";
export const Route = createFileRoute("/_authenticated/billing/payments")({
  component: CommercePaymentsPage,
});
