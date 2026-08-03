import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  DirectoryProjectListItemOut,
  PlatformListProjectsData,
} from "@arclayer/platform-openapi";

import { getTenantProject, listTenantProjects } from "@/api/tenant-directory";
import { TenantDirectoryTable, type DirectoryColumn } from "@/components/tenant-directory";
import { TenantProjectDossier } from "@/components/tenant-project-management";
import { SAVED_VIEW_DEFINITIONS, type SavedViewState } from "@/saved-views/saved-view-contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TenantProjectsSearch = Readonly<{
  q?: string;
  ordering?: string;
  isActive?: boolean;
  runtimeHealth?: "healthy" | "degraded" | "inactive" | "not_deployed" | "unavailable";
  page?: number;
}>;
const ORDERING = ["-created_at", "created_at", "name", "-name", "-activity_at"] as const;

export function TenantProjectsPage(props: {
  search: TenantProjectsSearch;
  onSearchChange: (search: TenantProjectsSearch) => void;
}) {
  const { t } = useTranslation("tenants");
  const query = useMemo<NonNullable<PlatformListProjectsData["query"]>>(
    () => ({
      q: props.search.q,
      ordering: props.search.ordering,
      is_active: props.search.isActive,
      runtime_health: props.search.runtimeHealth,
      page: props.search.page ?? 1,
      size: 25,
    }),
    [props.search],
  );
  const load = useCallback(() => listTenantProjects(query), [query]);
  const loadDetail = useCallback(
    async (item: DirectoryProjectListItemOut, onChanged: () => void) => (
      <TenantProjectDossier item={await getTenantProject(item.projectId)} onChanged={onChanged} />
    ),
    [],
  );
  const update = (next: Partial<TenantProjectsSearch>) =>
    props.onSearchChange({ ...props.search, ...next, page: next.page ?? 1 });
  const savedState: SavedViewState = {
    ...SAVED_VIEW_DEFINITIONS.tenantProjects.defaultState,
    filters: [
      ...(props.search.isActive === undefined
        ? []
        : [{ code: "is_active", value: props.search.isActive }]),
      ...(props.search.runtimeHealth
        ? [{ code: "runtime_health", value: props.search.runtimeHealth }]
        : []),
    ],
    ordering: {
      code: (props.search.ordering ?? "-created_at").replace(/^-/, ""),
      direction: (props.search.ordering ?? "-created_at").startsWith("-") ? "desc" : "asc",
    },
  };
  const applySavedView = (state: SavedViewState) => {
    const filter = (code: string) => state.filters.find((item) => item.code === code)?.value;
    const isActive = filter("is_active");
    const runtimeHealth = filter("runtime_health");
    props.onSearchChange({
      q: undefined,
      page: 1,
      ordering: `${state.ordering.direction === "desc" ? "-" : ""}${state.ordering.code}`,
      isActive: typeof isActive === "boolean" ? isActive : undefined,
      runtimeHealth:
        runtimeHealth === "healthy" ||
        runtimeHealth === "degraded" ||
        runtimeHealth === "inactive" ||
        runtimeHealth === "not_deployed" ||
        runtimeHealth === "unavailable"
          ? runtimeHealth
          : undefined,
    });
  };
  const columns: readonly DirectoryColumn<DirectoryProjectListItemOut>[] = [
    { label: t("WORKSPACE"), render: (item) => item.workspaceName },
    { label: t("RUNTIME"), render: (item) => t(`RUNTIME_${item.operations.health.toUpperCase()}`) },
    { label: t("ACTIVITY"), render: (item) => new Date(item.lastActivityAt).toLocaleString() },
  ];
  return (
    <TenantDirectoryTable
      columns={columns}
      description={t("PROJECTS_DESCRIPTION")}
      detailDescription={t("PROJECT_DETAIL_DESCRIPTION")}
      detailTitle={t("PROJECT_DETAIL_TITLE")}
      filters={
        <Filters
          ordering={props.search.ordering}
          active={props.search.isActive}
          onChange={update}
        />
      }
      hasFilters={Boolean(
        props.search.q || props.search.isActive !== undefined || props.search.runtimeHealth,
      )}
      identity={(item) => <Identity name={item.name} secondary={item.slug} />}
      itemKey={(item) => item.projectId}
      load={load}
      loadDetail={loadDetail}
      onPageChange={(page) => update({ page })}
      onSearchChange={(q) => update({ q })}
      searchPlaceholder={t("PROJECTS_SEARCH")}
      searchValue={props.search.q}
      savedViews={{
        definition: SAVED_VIEW_DEFINITIONS.tenantProjects,
        state: savedState,
        onApply: applySavedView,
      }}
      title={t("PROJECTS_TITLE")}
    />
  );
}

function Filters(props: {
  ordering?: string;
  active?: boolean;
  onChange: (next: Partial<TenantProjectsSearch>) => void;
}) {
  const { t } = useTranslation("tenants");
  return (
    <>
      <Select
        onValueChange={(value) => props.onChange({ ordering: value })}
        value={props.ordering ?? "-created_at"}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORDERING.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`ORDER_${value.replace(/^-/, "DESC_").replace(/-/g, "_").toUpperCase()}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        onValueChange={(value) =>
          props.onChange({ isActive: value === "all" ? undefined : value === "active" })
        }
        value={props.active === undefined ? "all" : props.active ? "active" : "inactive"}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("ALL_STATES")}</SelectItem>
          <SelectItem value="active">{t("ACTIVE")}</SelectItem>
          <SelectItem value="inactive">{t("INACTIVE")}</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}

function Identity(props: { name: string; secondary: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{props.name}</p>
      <p className="truncate text-sm text-muted-foreground">{props.secondary}</p>
    </div>
  );
}
