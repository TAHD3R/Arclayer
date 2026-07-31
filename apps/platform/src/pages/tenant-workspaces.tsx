import { useCallback, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type {
  DirectoryWorkspaceListItemOut,
  PlatformListWorkspacesData,
} from "@arclayer/platform-openapi";

import { getTenantWorkspace, listTenantWorkspaces } from "@/api/tenant-directory";
import { TenantDirectoryTable, type DirectoryColumn } from "@/components/tenant-directory";
import { SAVED_VIEW_DEFINITIONS, type SavedViewState } from "@/saved-views/saved-view-contracts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";

export type TenantWorkspacesSearch = Readonly<{
  q?: string;
  ordering?: string;
  isArchived?: boolean;
  isActive?: boolean;
  planCode?: string;
  commerceRisk?: "healthy" | "attention_required" | "data_missing";
  page?: number;
}>;

const ORDERING = ["-created_at", "created_at", "name", "-name", "-activity_at"] as const;

export function TenantWorkspacesPage(props: {
  search: TenantWorkspacesSearch;
  onSearchChange: (search: TenantWorkspacesSearch) => void;
}) {
  const { t } = useTranslation("tenants");
  const query = useMemo<NonNullable<PlatformListWorkspacesData["query"]>>(
    () => ({
      q: props.search.q,
      ordering: props.search.ordering,
      is_archived: props.search.isArchived,
      is_active: props.search.isActive,
      plan_code: props.search.planCode,
      commerce_risk: props.search.commerceRisk,
      page: props.search.page ?? 1,
      size: 25,
    }),
    [props.search],
  );
  const load = useCallback(() => listTenantWorkspaces(query), [query]);
  const update = (next: Partial<TenantWorkspacesSearch>) =>
    props.onSearchChange({ ...props.search, ...next, page: next.page ?? 1 });
  const savedState: SavedViewState = {
    ...SAVED_VIEW_DEFINITIONS.tenantWorkspaces.defaultState,
    filters: [
      ...(props.search.isActive === undefined
        ? []
        : [{ code: "is_active", value: props.search.isActive }]),
      ...(props.search.isArchived === undefined
        ? []
        : [{ code: "is_archived", value: props.search.isArchived }]),
      ...(props.search.planCode ? [{ code: "plan_code", value: props.search.planCode }] : []),
      ...(props.search.commerceRisk
        ? [{ code: "commerce_risk", value: props.search.commerceRisk }]
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
    const isArchived = filter("is_archived");
    const planCode = filter("plan_code");
    const commerceRisk = filter("commerce_risk");
    props.onSearchChange({
      q: undefined,
      page: 1,
      ordering: `${state.ordering.direction === "desc" ? "-" : ""}${state.ordering.code}`,
      isActive: typeof isActive === "boolean" ? isActive : undefined,
      isArchived: typeof isArchived === "boolean" ? isArchived : undefined,
      planCode: typeof planCode === "string" ? planCode : undefined,
      commerceRisk:
        commerceRisk === "healthy" ||
        commerceRisk === "attention_required" ||
        commerceRisk === "data_missing"
          ? commerceRisk
          : undefined,
    });
  };
  const columns: readonly DirectoryColumn<DirectoryWorkspaceListItemOut>[] = [
    {
      label: t("OWNER"),
      render: (item) => item.owner?.displayName ?? item.owner?.username ?? t("UNAVAILABLE"),
    },
    {
      label: t("COMMERCE"),
      render: (item) =>
        item.commerce.dataState === "missing"
          ? t("COMMERCE_MISSING")
          : (item.commerce.planCode ?? t("UNAVAILABLE")),
    },
    { label: t("ACTIVITY"), render: (item) => new Date(item.lastActivityAt).toLocaleString() },
  ];
  const loadDetail = useCallback(
    async (item: DirectoryWorkspaceListItemOut) => (
      <WorkspaceDetail item={await getTenantWorkspace(item.workspaceId)} />
    ),
    [],
  );
  return (
    <TenantDirectoryTable
      columns={columns}
      description={t("WORKSPACES_DESCRIPTION")}
      filters={
        <DirectoryFilters
          archived={props.search.isArchived}
          active={props.search.isActive}
          ordering={props.search.ordering}
          onChange={update}
        />
      }
      hasFilters={Boolean(
        props.search.q ||
        props.search.isArchived !== undefined ||
        props.search.isActive !== undefined ||
        props.search.planCode ||
        props.search.commerceRisk,
      )}
      identity={(item) => <Identity name={item.name} secondary={item.description} />}
      itemKey={(item) => item.workspaceId}
      load={load}
      loadDetail={loadDetail}
      onPageChange={(page) => update({ page })}
      onSearchChange={(q) => update({ q })}
      partial={(items) =>
        items.some((item) => item.commerce.dataState === "partial") ? (
          <p className="text-footnote text-label-secondary">{t("PARTIAL_COMMERCE")}</p>
        ) : null
      }
      searchPlaceholder={t("WORKSPACES_SEARCH")}
      searchValue={props.search.q}
      savedViews={{
        definition: SAVED_VIEW_DEFINITIONS.tenantWorkspaces,
        state: savedState,
        onApply: applySavedView,
      }}
      title={t("WORKSPACES_TITLE")}
    />
  );
}

function DirectoryFilters(props: {
  archived?: boolean;
  active?: boolean;
  ordering?: string;
  onChange: (next: Partial<TenantWorkspacesSearch>) => void;
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

function WorkspaceDetail(props: { item: Awaited<ReturnType<typeof getTenantWorkspace>> }) {
  const { t } = useTranslation("tenants");
  return (
    <dl className="grid gap-4 text-body">
      <Detail
        label={t("OWNER")}
        value={props.item.owner?.displayName ?? props.item.owner?.username ?? t("UNAVAILABLE")}
      />
      <Detail label={t("MEMBERS")} value={String(props.item.memberCount ?? 0)} />
      <Detail label={t("PROJECTS")} value={String(props.item.projectCount ?? 0)} />
      <Detail label={t("COMMERCE")} value={props.item.commerce.planCode ?? t("COMMERCE_MISSING")} />
      <Link className="text-primary underline underline-offset-4" to="/monitoring/requests">
        {t("VIEW_REQUESTS")}
      </Link>
    </dl>
  );
}

function Identity(props: { name: string; secondary?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{props.name}</p>
      {props.secondary ? (
        <p className="truncate text-footnote text-label-secondary">{props.secondary}</p>
      ) : null}
    </div>
  );
}
function Detail(props: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-footnote text-label-secondary">{props.label}</dt>
      <dd>{props.value}</dd>
    </div>
  );
}
