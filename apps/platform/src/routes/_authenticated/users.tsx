import { createFileRoute } from "@tanstack/react-router";

import { TenantUsersPage, type TenantUsersSearch } from "@/pages/tenant-users";

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readPage(value: unknown): number | undefined {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : undefined;
}

export const Route = createFileRoute("/_authenticated/users")({
  validateSearch: (search: Record<string, unknown>): TenantUsersSearch => ({
    q: readText(search.q),
    ordering: readText(search.ordering),
    status:
      search.status === "active" || search.status === "disabled" || search.status === "locked"
        ? search.status
        : undefined,
    twoFactorEnabled:
      search.twoFactorEnabled === true || search.twoFactorEnabled === "true"
        ? true
        : search.twoFactorEnabled === false || search.twoFactorEnabled === "false"
          ? false
          : undefined,
    page: readPage(search.page),
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
