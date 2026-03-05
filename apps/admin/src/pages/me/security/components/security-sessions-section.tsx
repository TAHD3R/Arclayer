import { Button, Input } from "antd";
import type { ColumnDef } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import {
  DataTablePresenter,
  DataTableToolbarTools,
  useDataTable,
  useDataTableDensityPreference,
} from "@celestial/ui/data-table";
import type { PageData } from "@celestial/ui/data-table";
import { SettingVerticalItem } from "@celestial/ui/setting-vertical-item";

type SessionRow = {
  id: string;
  device: string;
  ip: string;
  location: string;
  signedInAt: string;
  lastActiveAt: string;
};

async function fetchSessions(params: {
  page: number;
  size: number;
  q?: string;
  ordering?: string;
}): Promise<PageData<SessionRow>> {
  // TODO: Backend endpoint not available yet.
  // Keep the data-table structure ready so we can plug in API later.
  return {
    items: [],
    total: 0,
    page: params.page,
    size: params.size,
    pages: 0,
    next: null,
    prev: null,
  };
}

export function MeSecuritySessionsSection() {
  const { t } = useTranslation(["account", "common", "settings"]);

  const columns = useMemo(() => {
    const cols: ColumnDef<SessionRow, any>[] = [
      {
        accessorKey: "device",
        header: t("account:ME_SECURITY_SESSIONS_COL_DEVICE"),
        meta: {
          title: t("account:ME_SECURITY_SESSIONS_COL_DEVICE"),
          sortKey: "device",
        },
        cell: (ctx) => <div className="truncate">{String(ctx.getValue() ?? "")}</div>,
        size: 220,
      },
      {
        accessorKey: "location",
        header: t("account:ME_SECURITY_SESSIONS_COL_LOCATION"),
        meta: {
          title: t("account:ME_SECURITY_SESSIONS_COL_LOCATION"),
          sortKey: "location",
          defaultHidden: true,
        },
        cell: (ctx) => <div className="truncate">{String(ctx.getValue() ?? "")}</div>,
        size: 220,
      },
      {
        accessorKey: "ip",
        header: t("account:ME_SECURITY_SESSIONS_COL_IP"),
        meta: {
          title: t("account:ME_SECURITY_SESSIONS_COL_IP"),
          sortKey: "ip",
          defaultHidden: true,
        },
        cell: (ctx) => (
          <div className="font-mono text-footnote">{String(ctx.getValue() ?? "")}</div>
        ),
        size: 160,
      },
      {
        accessorKey: "signedInAt",
        header: t("account:ME_SECURITY_SESSIONS_COL_SIGNED_IN"),
        meta: {
          title: t("account:ME_SECURITY_SESSIONS_COL_SIGNED_IN"),
          sortKey: "signedInAt",
        },
        cell: (ctx) => <div className="truncate">{String(ctx.getValue() ?? "")}</div>,
        size: 200,
      },
      {
        accessorKey: "lastActiveAt",
        header: t("account:ME_SECURITY_SESSIONS_COL_LAST_ACTIVE"),
        meta: {
          title: t("account:ME_SECURITY_SESSIONS_COL_LAST_ACTIVE"),
          sortKey: "lastActiveAt",
        },
        cell: (ctx) => <div className="truncate">{String(ctx.getValue() ?? "")}</div>,
        size: 200,
      },
      {
        id: "actions",
        header: t("account:ME_SECURITY_SESSIONS_COL_ACTIONS"),
        meta: {
          title: t("account:ME_SECURITY_SESSIONS_COL_ACTIONS"),
          kind: "actions",
        },
        cell: () => (
          <Button disabled type="link" className="px-0!" autoInsertSpace={false}>
            {t("account:ME_SECURITY_SESSIONS_KICK")}
          </Button>
        ),
        size: 120,
      },
    ];
    return cols as ColumnDef<SessionRow, unknown>[];
  }, [t]);

  const table = useDataTable<SessionRow>({
    tableId: "me:sessions",
    columns,
    fetcher: fetchSessions,
    initialState: {
      pageSize: 10,
      sorting: [{ id: "lastActiveAt", desc: true }],
    },
    features: { sorting: { enabled: true, mode: "client" } },
    queryOptions: { retry: false, staleTime: 10 * 1000, meta: { silent: true } },
  });
  const [density, setDensity] = useDataTableDensityPreference({ tableId: "me:sessions" });
  const toolsLabels = useMemo(() => buildDataTableToolsLabels(t), [t]);
  const toolbarLeft = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        value={table.searchInput}
        onChange={(event) => table.setSearchInput(event.target.value)}
        placeholder={t("account:ME_SECURITY_SESSIONS_SEARCH_PLACEHOLDER")}
        allowClear
        variant="filled"
        prefix={<Search className="size-4 text-label-secondary" />}
        className="max-w-[320px]"
      />
    </div>
  );
  const toolbarRight = (
    <DataTableToolbarTools
      table={table.table}
      density={density}
      onDensityChange={setDensity}
      onRefresh={() => void table.refetch()}
      refreshing={table.isFetching}
      onResetColumnVisibility={table.resetColumnVisibility}
      labels={toolsLabels}
      components={{ IconButton: DataTableToolbarAntdIconButton }}
    />
  );

  return (
    <SettingVerticalItem
      title={t("account:ME_SECURITY_SESSIONS_PANEL_TITLE")}
      description={t("account:ME_SECURITY_SESSIONS_TABLE_DESC")}
      control={
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-end">
            <Button disabled danger type="primary" autoInsertSpace={false}>
              {t("account:ME_SECURITY_SESSIONS_KICK_ALL")}
            </Button>
          </div>

          <DataTablePresenter
            table={table.table}
            emptyText={t("account:ME_SECURITY_SESSIONS_EMPTY")}
            className="min-h-0"
            toolbar={{ left: toolbarLeft, right: toolbarRight }}
            density={density}
            refreshing={table.isFetching && !table.isLoading}
          />
        </div>
      }
    />
  );
}
