import type { ColumnDef, Table as ReactTable } from "@tanstack/react-table";
import { LogOut } from "lucide-react";

import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { SecurityCurrentSessionTag } from "@/components/ui/tags";
import { DataTablePresenter, type DataTableRowHeight } from "@arclayer/ui/data-table";
import { Button } from "@arclayer/ui/button";

export type SessionRow = {
  sessionId: string;
  current: boolean;
  revocable: boolean;
  device: string;
  ip: string;
  location: string;
  authMethod: string;
  signedInAt: string;
  lastActiveAt: string;
};

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;
type FormatDateTimeFn = (
  value: string | null | undefined,
  options?: { emptyValue?: string },
) => string;

type ColumnFactoryProps = {
  t: TranslateFn;
  formatDateTime: FormatDateTimeFn;
  isRevoking: boolean;
  revokingSessionId: string | null;
  onRevoke: (sessionId: string) => void;
};

function formatAuthMethod(value: string, t: TranslateFn): string {
  if (value === "password") return t("account:ME_SECURITY_SESSIONS_AUTH_METHOD_PASSWORD");
  if (value === "sso") return t("account:ME_SECURITY_SESSIONS_AUTH_METHOD_SSO");
  return value;
}

function renderDeviceCell(row: SessionRow, t: TranslateFn) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="min-w-0 truncate">{row.device}</span>
      {row.current ? (
        <SecurityCurrentSessionTag
          className="shrink-0"
          label={t("account:ME_SECURITY_SESSIONS_CURRENT")}
        />
      ) : null}
    </div>
  );
}

function renderDateCell(value: string, formatDateTime: FormatDateTimeFn) {
  return <span className="truncate">{formatDateTime(value || null, { emptyValue: "-" })}</span>;
}

function buildTextColumn(props: {
  key: "location" | "ip";
  title: string;
  sortKey: "location" | "ip";
  className?: string;
  defaultHidden?: boolean;
}): ColumnDef<SessionRow, unknown> {
  return {
    accessorKey: props.key,
    header: props.title,
    meta: {
      title: props.title,
      sortKey: props.sortKey,
      defaultHidden: props.defaultHidden,
      kind: "meta",
    },
    cell: ({ row }) => <span className={props.className}>{row.original[props.key]}</span>,
    size: props.key === "location" ? 220 : 160,
  };
}

function buildDateColumn(props: {
  key: "signedInAt" | "lastActiveAt";
  title: string;
  formatDateTime: FormatDateTimeFn;
  defaultHidden?: boolean;
}): ColumnDef<SessionRow, unknown> {
  return {
    accessorKey: props.key,
    header: props.title,
    meta: {
      title: props.title,
      sortKey: props.key,
      defaultHidden: props.defaultHidden,
      kind: "time",
    },
    cell: ({ row }) => renderDateCell(row.original[props.key], props.formatDateTime),
    size: 200,
  };
}

function buildActionColumn(props: ColumnFactoryProps): ColumnDef<SessionRow, unknown> {
  const signOutLabel = props.t("account:ME_SECURITY_SESSIONS_KICK");
  return {
    id: "action",
    header: "",
    enableHiding: false,
    enableSorting: false,
    meta: buildDataTableActionsColumnMeta("right"),
    cell: ({ row }) => (
      <DataTableActionsCell>
        <Button
          variant="link"
          aria-label={signOutLabel}
          title={signOutLabel}
          disabled={!row.original.revocable}
          loading={props.isRevoking && props.revokingSessionId === row.original.sessionId}
          className="inline-flex items-center gap-1 px-0! text-label-secondary hover:text-label-primary"
          onClick={() => props.onRevoke(row.original.sessionId)}
        >
          <LogOut className="h-4 w-4" />
          {signOutLabel}
        </Button>
      </DataTableActionsCell>
    ),
    size: 150,
    minSize: 150,
  };
}

export function buildSessionColumns(props: ColumnFactoryProps): ColumnDef<SessionRow, unknown>[] {
  return [
    {
      accessorKey: "device",
      header: props.t("account:ME_SECURITY_SESSIONS_COL_DEVICE"),
      meta: {
        title: props.t("account:ME_SECURITY_SESSIONS_COL_DEVICE"),
        sortKey: "device",
        kind: "primary",
      },
      cell: ({ row }) => renderDeviceCell(row.original, props.t),
      size: 240,
    },
    buildTextColumn({
      key: "location",
      title: props.t("account:ME_SECURITY_SESSIONS_COL_LOCATION"),
      sortKey: "location",
      defaultHidden: false,
    }),
    buildTextColumn({
      key: "ip",
      title: props.t("account:ME_SECURITY_SESSIONS_COL_IP"),
      sortKey: "ip",
      className: "font-mono text-footnote",
      defaultHidden: true,
    }),
    {
      accessorKey: "authMethod",
      header: props.t("account:ME_SECURITY_SESSIONS_COL_AUTH_METHOD"),
      meta: {
        title: props.t("account:ME_SECURITY_SESSIONS_COL_AUTH_METHOD"),
        sortKey: "authMethod",
        defaultHidden: true,
        kind: "status",
      },
      cell: ({ row }) => <span>{formatAuthMethod(row.original.authMethod, props.t)}</span>,
      size: 160,
    },
    buildDateColumn({
      key: "signedInAt",
      title: props.t("account:ME_SECURITY_SESSIONS_COL_SIGNED_IN"),
      formatDateTime: props.formatDateTime,
      defaultHidden: true,
    }),
    buildDateColumn({
      key: "lastActiveAt",
      title: props.t("account:ME_SECURITY_SESSIONS_COL_LAST_ACTIVE"),
      formatDateTime: props.formatDateTime,
    }),
    buildActionColumn(props),
  ];
}

type SecuritySessionsTableContentProps = {
  table: ReactTable<SessionRow>;
  isFetching: boolean;
  isLoading: boolean;
  rowHeight: DataTableRowHeight;
  wrapHeaders: boolean;
  emptyText: string;
  toolbar?: React.ReactNode;
};

export function SecuritySessionsTableContent(props: SecuritySessionsTableContentProps) {
  return (
    <div className="grid min-w-0 max-w-full gap-4">
      <div className="min-w-0 max-w-full overflow-x-auto">
        <DataTablePresenter
          table={props.table}
          emptyText={props.emptyText}
          className="min-h-0 min-w-0 w-full"
          toolbar={props.toolbar ? { fullWidth: props.toolbar } : undefined}
          rowHeight={props.rowHeight}
          wrapHeaders={props.wrapHeaders}
          refreshing={props.isFetching && !props.isLoading}
        />
      </div>
    </div>
  );
}
