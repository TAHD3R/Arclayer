import { createFileRoute } from "@tanstack/react-router";

import { CommercePlansPage } from "@/pages/commerce-plans";

export const Route = createFileRoute("/_authenticated/commerce/plans")({
  component: CommercePlansPage,
});
