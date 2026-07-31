import { createFileRoute } from "@tanstack/react-router";

import { TenantProjectsPage, type TenantProjectsSearch } from "@/pages/tenant-projects";

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

export const Route = createFileRoute("/_authenticated/tenants/projects/")({
  validateSearch: (search: Record<string, unknown>): TenantProjectsSearch => ({
    q: string(search.q),
    ordering: string(search.ordering),
    isActive: boolean(search.isActive),
    runtimeHealth:
      search.runtimeHealth === "healthy" ||
      search.runtimeHealth === "degraded" ||
      search.runtimeHealth === "inactive" ||
      search.runtimeHealth === "not_deployed" ||
      search.runtimeHealth === "unavailable"
        ? search.runtimeHealth
        : undefined,
    page: page(search.page),
  }),
  component: () => {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <TenantProjectsPage
        onSearchChange={(next) => void navigate({ search: next, replace: true })}
        search={search}
      />
    );
  },
});
