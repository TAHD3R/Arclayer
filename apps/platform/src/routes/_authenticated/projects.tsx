import { createFileRoute } from "@tanstack/react-router";

import { TenantProjectsPage, type TenantProjectsSearch } from "@/pages/tenant-projects";

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readPage(value: unknown): number | undefined {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : undefined;
}

export const Route = createFileRoute("/_authenticated/projects")({
  validateSearch: (search: Record<string, unknown>): TenantProjectsSearch => ({
    q: readText(search.q),
    ordering: readText(search.ordering),
    isActive:
      search.isActive === true || search.isActive === "true"
        ? true
        : search.isActive === false || search.isActive === "false"
          ? false
          : undefined,
    runtimeHealth:
      search.runtimeHealth === "healthy" ||
      search.runtimeHealth === "degraded" ||
      search.runtimeHealth === "inactive" ||
      search.runtimeHealth === "not_deployed" ||
      search.runtimeHealth === "unavailable"
        ? search.runtimeHealth
        : undefined,
    page: readPage(search.page),
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
