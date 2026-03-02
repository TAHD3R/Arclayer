import { Button } from "antd";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DataTablePresenter, useDataTable } from "@/components/data-table";
import type { PageData } from "@/components/data-table/types";
import { SettingVerticalItem } from "@/components/settings-primitives/setting-vertical-item";

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
  const { t } = useTranslation(["account", "settings"]);

  const columns = useMemo(() => {
    const cols: ColumnDef<SessionRow, any>[] = [
      {
        accessorKey: "device",
        header: t("account:ME_SECURITY_SESSIONS_COL_DEVICE"),
        cell: (ctx) => <div className="truncate">{String(ctx.getValue() ?? "")}</div>,
        size: 220,
      },
      {
        accessorKey: "location",
        header: t("account:ME_SECURITY_SESSIONS_COL_LOCATION"),
        cell: (ctx) => <div className="truncate">{String(ctx.getValue() ?? "")}</div>,
        size: 220,
      },
      {
        accessorKey: "ip",
        header: t("account:ME_SECURITY_SESSIONS_COL_IP"),
        cell: (ctx) => (
          <div className="font-mono text-footnote">{String(ctx.getValue() ?? "")}</div>
        ),
        size: 160,
      },
      {
        accessorKey: "signedInAt",
        header: t("account:ME_SECURITY_SESSIONS_COL_SIGNED_IN"),
        cell: (ctx) => <div className="truncate">{String(ctx.getValue() ?? "")}</div>,
        size: 200,
      },
      {
        accessorKey: "lastActiveAt",
        header: t("account:ME_SECURITY_SESSIONS_COL_LAST_ACTIVE"),
        cell: (ctx) => <div className="truncate">{String(ctx.getValue() ?? "")}</div>,
        size: 200,
      },
      {
        id: "actions",
        header: t("account:ME_SECURITY_SESSIONS_COL_ACTIONS"),
        meta: { kind: "actions" },
        cell: () => (
          <Button disabled type="link" className="px-0!">
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
    initialState: { pageSize: 10 },
    features: { sorting: { enabled: true, mode: "client" } },
    queryOptions: { retry: false, staleTime: 10 * 1000, meta: { silent: true } },
  });

  return (
    <SettingVerticalItem
      title={t("account:ME_SECURITY_SESSIONS_PANEL_TITLE")}
      description={t("account:ME_SECURITY_SESSIONS_TABLE_DESC")}
      control={
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-end">
            <Button disabled danger type="primary">
              {t("account:ME_SECURITY_SESSIONS_KICK_ALL")}
            </Button>
          </div>

          <DataTablePresenter
            table={table.table}
            emptyText={t("account:ME_SECURITY_SESSIONS_EMPTY")}
            className="min-h-0"
          />
        </div>
      }
    />
  );
}
