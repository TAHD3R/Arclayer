import { createFileRoute } from "@tanstack/react-router";

import { CommerceSubscriptionsPage } from "@/pages/commerce-subscriptions";

export type CommerceSubscriptionsSearch = Readonly<{
  page?: number;
  planCode?: string;
  status?: "active" | "past_due" | "canceled";
  provider?: string;
}>;

export const Route = createFileRoute("/_authenticated/commerce/subscriptions")({
  validateSearch: (value: Record<string, unknown>): CommerceSubscriptionsSearch => ({
    page:
      Number.isInteger(Number(value.page)) && Number(value.page) > 0
        ? Number(value.page)
        : undefined,
    planCode:
      typeof value.planCode === "string" && value.planCode.trim()
        ? value.planCode.trim()
        : undefined,
    status:
      value.status === "active" || value.status === "past_due" || value.status === "canceled"
        ? value.status
        : undefined,
    provider:
      typeof value.provider === "string" && value.provider.trim()
        ? value.provider.trim()
        : undefined,
  }),
  component: () => {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <CommerceSubscriptionsPage
        onSearchChange={(next) => void navigate({ search: next, replace: true })}
        search={search}
      />
    );
  },
});
