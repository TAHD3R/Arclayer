import { createFileRoute } from "@tanstack/react-router";

import { TenantWorkspacesPage, type TenantWorkspacesSearch } from "@/pages/tenant-workspaces";

function string(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function boolean(value: unknown) {
  return value === true || value === "true"
    ? true
    : value === false || value === "false"
      ? false
      : undefined;
}
function page(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const Route = createFileRoute("/_authenticated/tenants/workspaces/")({
  validateSearch: (search: Record<string, unknown>): TenantWorkspacesSearch => ({
    q: string(search.q),
    ordering: string(search.ordering),
    isArchived: boolean(search.isArchived),
    isActive: boolean(search.isActive),
    planCode: string(search.planCode),
    commerceRisk:
      search.commerceRisk === "healthy" ||
      search.commerceRisk === "attention_required" ||
      search.commerceRisk === "data_missing"
        ? search.commerceRisk
        : undefined,
    page: page(search.page),
  }),
  component: () => {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <TenantWorkspacesPage
        onSearchChange={(next) => void navigate({ search: next, replace: true })}
        search={search}
      />
    );
  },
});
