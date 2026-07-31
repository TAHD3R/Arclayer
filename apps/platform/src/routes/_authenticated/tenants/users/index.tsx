import { createFileRoute } from "@tanstack/react-router";

import { TenantUsersPage, type TenantUsersSearch } from "@/pages/tenant-users";

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

export const Route = createFileRoute("/_authenticated/tenants/users/")({
  validateSearch: (search: Record<string, unknown>): TenantUsersSearch => ({
    q: string(search.q),
    ordering: string(search.ordering),
    status:
      search.status === "active" || search.status === "disabled" || search.status === "locked"
        ? search.status
        : undefined,
    twoFactorEnabled: boolean(search.twoFactorEnabled),
    page: page(search.page),
  }),
  component: () => {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <TenantUsersPage
        onSearchChange={(next) => void navigate({ search: next, replace: true })}
        search={search}
      />
    );
  },
});
