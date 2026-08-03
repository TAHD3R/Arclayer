import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { DirectoryUserListItemOut, PlatformListUsersData } from "@arclayer/platform-openapi";

import { getTenantUser, listTenantUsers } from "@/api/tenant-directory";
import { TenantDirectoryTable, type DirectoryColumn } from "@/components/tenant-directory";
import { TenantUserDossier } from "@/components/tenant-user-management";
import { SAVED_VIEW_DEFINITIONS, type SavedViewState } from "@/saved-views/saved-view-contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type TenantUsersSearch = Readonly<{
  q?: string;
  ordering?: string;
  status?: "active" | "disabled" | "locked";
  twoFactorEnabled?: boolean;
  page?: number;
}>;
const ORDERING = ["-created_at", "created_at", "username", "-username", "-last_login_at"] as const;

export function TenantUsersPage(props: {
  search: TenantUsersSearch;
  onSearchChange: (search: TenantUsersSearch) => void;
}) {
  const { t } = useTranslation("tenants");
  const query = useMemo<NonNullable<PlatformListUsersData["query"]>>(
    () => ({
      q: props.search.q,
      ordering: props.search.ordering,
      status: props.search.status,
      two_factor_enabled: props.search.twoFactorEnabled,
      page: props.search.page ?? 1,
      size: 25,
    }),
    [props.search],
  );
  const load = useCallback(() => listTenantUsers(query), [query]);
  const loadDetail = useCallback(
    async (item: DirectoryUserListItemOut, onChanged: () => void) => (
      <TenantUserDossier item={await getTenantUser(item.userId)} onChanged={onChanged} />
    ),
    [],
  );
  const update = (next: Partial<TenantUsersSearch>) =>
    props.onSearchChange({ ...props.search, ...next, page: next.page ?? 1 });
  const savedState: SavedViewState = {
    ...SAVED_VIEW_DEFINITIONS.tenantUsers.defaultState,
    filters: [
      ...(props.search.status ? [{ code: "status", value: props.search.status }] : []),
      ...(props.search.twoFactorEnabled === undefined
        ? []
        : [{ code: "two_factor_enabled", value: props.search.twoFactorEnabled }]),
    ],
    ordering: {
      code: (props.search.ordering ?? "-created_at").replace(/^-/, ""),
      direction: (props.search.ordering ?? "-created_at").startsWith("-") ? "desc" : "asc",
    },
  };
  const applySavedView = (state: SavedViewState) => {
    const filter = (code: string) => state.filters.find((item) => item.code === code)?.value;
    const status = filter("status");
    const twoFactorEnabled = filter("two_factor_enabled");
    props.onSearchChange({
      q: undefined,
      page: 1,
      ordering: `${state.ordering.direction === "desc" ? "-" : ""}${state.ordering.code}`,
      status:
        status === "active" || status === "disabled" || status === "locked" ? status : undefined,
      twoFactorEnabled: typeof twoFactorEnabled === "boolean" ? twoFactorEnabled : undefined,
    });
  };
  const columns: readonly DirectoryColumn<DirectoryUserListItemOut>[] = [
    { label: t("STATUS"), render: (item) => t(`STATUS_${item.status.toUpperCase()}`) },
    {
      label: t("SECURITY"),
      render: (item) =>
        item.twoFactorEnabled ? t("TWO_FACTOR_ENABLED") : t("TWO_FACTOR_DISABLED"),
    },
    {
      label: t("MEMBERSHIPS"),
      render: (item) =>
        t("MEMBERSHIP_COUNTS", {
          workspaces: item.workspaceMembershipCount ?? 0,
          projects: item.projectMembershipCount ?? 0,
        }),
    },
  ];
  return (
    <TenantDirectoryTable
      columns={columns}
      description={t("USERS_DESCRIPTION")}
      detailDescription={t("USER_DETAIL_DESCRIPTION")}
      detailTitle={t("USER_DETAIL_TITLE")}
      filters={
        <Filters ordering={props.search.ordering} status={props.search.status} onChange={update} />
      }
      hasFilters={Boolean(
        props.search.q || props.search.status || props.search.twoFactorEnabled !== undefined,
      )}
      identity={(item) => (
        <Identity
          name={item.displayName ?? item.username}
          secondary={item.email ?? item.username}
        />
      )}
      itemKey={(item) => item.userId}
      load={load}
      loadDetail={loadDetail}
      onPageChange={(page) => update({ page })}
      onSearchChange={(q) => update({ q })}
      searchPlaceholder={t("USERS_SEARCH")}
      searchValue={props.search.q}
      savedViews={{
        definition: SAVED_VIEW_DEFINITIONS.tenantUsers,
        state: savedState,
        onApply: applySavedView,
      }}
      title={t("USERS_TITLE")}
    />
  );
}

function Filters(props: {
  ordering?: string;
  status?: TenantUsersSearch["status"];
  onChange: (next: Partial<TenantUsersSearch>) => void;
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
          props.onChange({
            status: value === "all" ? undefined : (value as TenantUsersSearch["status"]),
          })
        }
        value={props.status ?? "all"}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("ALL_STATES")}</SelectItem>
          <SelectItem value="active">{t("STATUS_ACTIVE")}</SelectItem>
          <SelectItem value="disabled">{t("STATUS_DISABLED")}</SelectItem>
          <SelectItem value="locked">{t("STATUS_LOCKED")}</SelectItem>
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
