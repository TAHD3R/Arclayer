import { useMemo, useRef, useState, type MutableRefObject } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "antd";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import type { AuthSessionRow } from "@/types/api";
import {
  useDataTable,
  useDataTableDensityPreference,
  type PageData,
} from "@celestial/ui/data-table";
import { SettingCard, SettingCardContent, SettingCardHeader } from "@celestial/ui/setting-card";

import {
  buildSessionColumns,
  SecuritySessionsTableContent,
  type SessionRow,
} from "./security-sessions-table-view";

type SessionFetchParams = {
  page: number;
  size: number;
  q?: string;
  ordering?: string;
};

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
const SESSION_PLACEHOLDER_VALUES = new Set(["-", "unknown", "n/a", "null", "undefined"]);

function normalizeSessionLabel(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (SESSION_PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function buildLocationLabel(session: AuthSessionRow): string {
  const location = normalizeSessionLabel(session.locationLabel);
  if (location) return location;
  const ipAddress = normalizeSessionLabel(session.ipAddress);
  return ipAddress ?? "-";
}

function mapSessionRow(session: AuthSessionRow): SessionRow {
  return {
    sessionId: session.sessionId,
    current: Boolean(session.current),
    revocable: Boolean(session.revocable),
    device:
      normalizeSessionLabel(session.deviceLabel) ?? normalizeSessionLabel(session.userAgent) ?? "-",
    ip: normalizeSessionLabel(session.ipAddress) ?? "-",
    location: buildLocationLabel(session),
    authMethod: session.authMethod || "unknown",
    signedInAt: session.issuedAt,
    lastActiveAt: session.lastUsedAt || "",
  };
}

function filterRows(items: SessionRow[], query: string | undefined): SessionRow[] {
  const normalized = String(query || "")
    .trim()
    .toLowerCase();
  if (!normalized) return items;
  return items.filter((item) =>
    [item.device, item.location, item.ip, item.authMethod].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  );
}

function sortRows(items: SessionRow[], ordering: string | undefined): SessionRow[] {
  const normalizedOrdering = String(ordering || "").trim();
  if (!normalizedOrdering) return items;
  const desc = normalizedOrdering.startsWith("-");
  const key = (desc ? normalizedOrdering.slice(1) : normalizedOrdering) as keyof SessionRow;
  return [...items].sort((left, right) => {
    const result = String(left[key] || "").localeCompare(String(right[key] || ""));
    return desc ? -result : result;
  });
}

function paginateRows(items: SessionRow[], params: SessionFetchParams): PageData<SessionRow> {
  const total = items.length;
  const pages = total === 0 ? 0 : Math.ceil(total / params.size);
  const page = Math.min(Math.max(params.page, 1), Math.max(pages, 1));
  const start = (page - 1) * params.size;
  return {
    items: items.slice(start, start + params.size),
    total,
    page,
    size: params.size,
    pages,
    next: page < pages ? page + 1 : null,
    prev: page > 1 ? page - 1 : null,
  };
}

function buildSessionsPage(
  items: AuthSessionRow[],
  params: SessionFetchParams,
): PageData<SessionRow> {
  return paginateRows(
    sortRows(filterRows(items.map(mapSessionRow), params.q), params.ordering),
    params,
  );
}

function useSessionRevocationMutations(
  t: TranslateFn,
  refreshRef: MutableRefObject<() => Promise<unknown> | void>,
) {
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      setRevokingSessionId(sessionId);
      return authApi.revokeMySession(sessionId);
    },
    onSuccess: async () => {
      notifySuccessText(t("account:ME_SECURITY_SESSIONS_KICK_SUCCESS"));
      await refreshRef.current();
    },
    onError: (error) => notifyError(error),
    onSettled: () => setRevokingSessionId(null),
  });
  const revokeOthersMutation = useMutation({
    mutationFn: async () => authApi.revokeOtherSessions(),
    onSuccess: async (result) => {
      const revokedCount = result.revokedCount ?? result.revoked_count ?? 0;
      notifySuccessText(
        t("account:ME_SECURITY_SESSIONS_KICK_ALL_SUCCESS", { count: revokedCount }),
      );
      await refreshRef.current();
    },
    onError: (error) => notifyError(error),
  });
  return { revokingSessionId, revokeSessionMutation, revokeOthersMutation };
}

function SessionsAction(props: { loading: boolean; onClick: () => void; label: string }) {
  return (
    <Button
      danger
      type="primary"
      loading={props.loading}
      onClick={props.onClick}
      autoInsertSpace={false}
    >
      {props.label}
    </Button>
  );
}

function useSessionsTableController(t: TranslateFn) {
  const refreshRef = useRef<() => Promise<unknown> | void>(() => undefined);
  const dateTime = useAdminDateTimeFormatter();
  const { revokingSessionId, revokeSessionMutation, revokeOthersMutation } =
    useSessionRevocationMutations(t, refreshRef);
  const columns = useMemo(
    () =>
      buildSessionColumns({
        t,
        formatDateTime: dateTime.formatDateTime,
        isRevoking: revokeSessionMutation.isPending,
        revokingSessionId,
        onRevoke: revokeSessionMutation.mutate,
      }),
    [dateTime.formatDateTime, revokeSessionMutation.isPending, revokingSessionId, t],
  );
  const table = useDataTable<SessionRow>({
    tableId: "me:sessions",
    columns,
    fetcher: async (params) => buildSessionsPage((await authApi.listMySessions()).items, params),
    initialState: { pageSize: 10, sorting: [{ id: "lastActiveAt", desc: true }] },
    features: { sorting: { enabled: true, mode: "client" } },
    queryOptions: { retry: false, staleTime: 10 * 1000 },
  });
  refreshRef.current = () => table.refetch();
  const [density, setDensity] = useDataTableDensityPreference({ tableId: "me:sessions" });
  return {
    table,
    density,
    setDensity,
    toolsLabels: buildDataTableToolsLabels(t),
    revokeOthersMutation,
  };
}

export function MeSecuritySessionsSection() {
  const { t } = useTranslation(["account", "common", "settings"]);
  const controller = useSessionsTableController(t);

  return (
    <SettingCard>
      <SettingCardHeader
        title={t("account:ME_SECURITY_SESSIONS_PANEL_TITLE")}
        description={t("account:ME_SECURITY_SESSIONS_TABLE_DESC")}
        action={
          <SessionsAction
            loading={controller.revokeOthersMutation.isPending}
            onClick={() => controller.revokeOthersMutation.mutate()}
            label={t("account:ME_SECURITY_SESSIONS_KICK_ALL")}
          />
        }
      />
      <SettingCardContent className="min-w-0 max-w-full overflow-x-hidden">
        <SecuritySessionsTableContent
          table={controller.table.table}
          searchInput={controller.table.searchInput}
          onSearchInputChange={controller.table.setSearchInput}
          onRefresh={controller.table.refetch}
          isFetching={controller.table.isFetching}
          isLoading={controller.table.isLoading}
          onResetColumnVisibility={controller.table.resetColumnVisibility}
          density={controller.density}
          onDensityChange={controller.setDensity}
          toolsLabels={controller.toolsLabels}
          searchPlaceholder={t("account:ME_SECURITY_SESSIONS_SEARCH_PLACEHOLDER")}
          emptyText={t("account:ME_SECURITY_SESSIONS_EMPTY")}
        />
      </SettingCardContent>
    </SettingCard>
  );
}
