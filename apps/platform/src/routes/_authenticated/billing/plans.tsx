import { createFileRoute } from "@tanstack/react-router";
import { CommercePlansPage } from "@/pages/commerce-plans";
export const Route = createFileRoute("/_authenticated/billing/plans")({
  component: CommercePlansPage,
});
